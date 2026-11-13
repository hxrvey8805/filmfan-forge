import Capacitor
import CryptoKit
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

final class CineGeekViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WatchFocusPlugin())
    }
}

@available(iOS 16.0, *)
private struct FocusAppPicker: View {
    @State var selection: FamilyActivitySelection
    let editing: Bool
    let cancel: () -> Void
    let start: (Set<ApplicationToken>) -> Void

    var body: some View {
        let count = selection.applicationTokens.count
        let appsOnly = selection.categoryTokens.isEmpty && selection.webDomainTokens.isEmpty
        NavigationView {
            FamilyActivityPicker(
                headerText: "Choose individual apps to pause. Leave CineGeek and your video player available.",
                footerText: editing ? "Clear your choices for timer only." : "Remembered on this iPhone. End focus to unpause; if you force-quit CineGeek, reopen it.",
                selection: $selection
            )
            .navigationTitle("Apps to pause")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: cancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing ? "Save" : "Start focus") { start(selection.applicationTokens) }
                        .disabled(!appsOnly || count > 50 || (!editing && count == 0))
                }
            }
            .safeAreaInset(edge: .bottom) {
                if !appsOnly || count > 50 {
                    Text("Pick up to 50 individual apps. Deselect whole categories and websites.")
                        .font(.footnote).padding()
                }
            }
        }.navigationViewStyle(.stack)
    }
}

@objc(WatchFocusPlugin)
final class WatchFocusPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "WatchFocusPlugin"
    let jsName = "WatchFocus"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startWithApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise)
    ]

    // Accessed on the main queue. The web view only receives a count, never app identities.
    private var owner: String?
    private var pending: CAPPluginCall?
    private weak var picker: UIViewController?
    private var supportsSelection: Bool {
        guard #available(iOS 16.0, *) else { return false }
        return Bundle.main.object(forInfoDictionaryKey: "CineGeekFocusEntitlements") as? String == "App/WatchFocus.entitlements"
    }
    @available(iOS 16.0, *)
    private var store: ManagedSettingsStore { ManagedSettingsStore(named: .init("CineGeekWatchFocus")) }

    // Opaque Apple app tokens stay on this iPhone, outside backups and separate per viewer.
    private func selectionURL(_ viewer: String, create: Bool) throws -> URL {
        let fm = FileManager.default
        var folder = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: create)
            .appendingPathComponent("WatchFocusChoices", isDirectory: true)
        if create {
            try fm.createDirectory(at: folder, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try folder.setResourceValues(values)
        }
        let name = SHA256.hash(data: Data(viewer.utf8)).map { String(format: "%02x", $0) }.joined()
        return folder.appendingPathComponent(name)
    }
    @available(iOS 16.0, *)
    private func savedApps(_ viewer: String) -> Set<ApplicationToken>? {
        guard let url = try? selectionURL(viewer, create: false), let bytes = try? Data(contentsOf: url),
              let apps = try? JSONDecoder().decode(Set<ApplicationToken>.self, from: bytes), apps.count <= 50 else { return nil }
        return apps
    }
    @available(iOS 16.0, *)
    private func saveApps(_ apps: Set<ApplicationToken>, viewer: String) throws {
        try JSONEncoder().encode(apps).write(to: selectionURL(viewer, create: true), options: [.atomic, .completeFileProtection])
    }
    private func forgetRevokedChoices() {
        // A new authorization may issue different tokens. Never reuse an earlier grant's selection.
        if let folder = try? selectionURL("", create: false).deletingLastPathComponent() {
            try? FileManager.default.removeItem(at: folder)
        }
    }

    override func load() {
        // A cold launch has no surviving Focus timer, even if the web bundle fails to boot.
        if #available(iOS 16.0, *), supportsSelection { store.clearAllSettings() }
        NotificationCenter.default.addObserver(self, selector: #selector(changed), name: UIAccessibility.guidedAccessStatusDidChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(changed), name: UIApplication.didBecomeActiveNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }

    @MainActor private func status(viewer: String? = nil) -> [String: Any] {
        var pausedCount = 0
        if #available(iOS 16.0, *), supportsSelection, owner != nil, pending == nil {
            if authorized { pausedCount = store.shield.applications?.count ?? 0 }
            else { clearSession() }
        }
        var result: [String: Any] = ["locked": UIAccessibility.isGuidedAccessEnabled,
                "selectiveAvailable": supportsSelection, "paused": pausedCount, "session": owner ?? ""]
        if #available(iOS 16.0, *), supportsSelection {
            if !authorized { forgetRevokedChoices() }
            if let viewer { result["saved"] = savedApps(viewer)?.count ?? -1 }
        }
        return result
    }
    @available(iOS 16.0, *) @MainActor private var authorized: Bool {
        let status = AuthorizationCenter.shared.authorizationStatus
        if #available(iOS 26.4, *), status == .approvedWithDataAccess { return true }
        return status == .approved
    }
    @objc private func changed() {
        Task { @MainActor in self.notifyListeners("statusChanged", data: self.status()) }
    }
    @objc func getStatus(_ call: CAPPluginCall) {
        Task { @MainActor in call.resolve(self.status(viewer: call.getString("viewer"))) }
    }

    @MainActor private func clearSession() {
        if #available(iOS 16.0, *), supportsSelection { store.clearAllSettings() }
        owner = nil
        picker?.dismiss(animated: false)
        picker = nil
        pending?.resolve(["started": false])
        pending = nil
    }

    // A fresh JS runtime has lost its timer. Also clear persisted shields after a force quit.
    @objc func reset(_ call: CAPPluginCall) {
        Task { @MainActor in self.clearSession(); call.resolve() }
    }
    @objc func finish(_ call: CAPPluginCall) {
        Task { @MainActor in
            if let session = call.getString("session"), self.owner == session { self.clearSession(); self.changed() }
            call.resolve()
        }
    }

    @objc func startWithApps(_ call: CAPPluginCall) {
        Task { @MainActor [self] in
            guard #available(iOS 16.0, *), supportsSelection else {
                call.reject("App selection is unavailable on this device."); return
            }
            guard let session = call.getString("session"), !session.isEmpty, owner == nil else {
                call.reject("End the current focus session first."); return
            }
            guard let viewer = call.getString("viewer"), !viewer.isEmpty else {
                call.reject("Open the title again to choose your focus apps."); return
            }
            let editing = call.getBool("editOnly") == true
            // Selection and permission belong to viewing setup. Never open a picker mid-scene.
            if !editing, !authorized || savedApps(viewer)?.isEmpty != false {
                call.reject("Go back to viewing setup to choose your apps again, or use Timer only."); return
            }
            owner = session
            pending = call
            if !authorized {
                forgetRevokedChoices()
                do { try await AuthorizationCenter.shared.requestAuthorization(for: .individual) }
                catch {
                    guard pending === call else { return }
                    pending = nil; clearSession()
                    call.reject("Screen Time access wasn’t granted. You can still use the timer."); return
                }
            }
            guard pending === call else { return }
            guard authorized else {
                pending = nil; clearSession(); call.reject("Screen Time access is off."); return
            }
            @MainActor func complete(_ selected: Set<ApplicationToken>, remember: Bool) {
                guard pending === call else { return }
                pending = nil
                var apps = selected
                if let id = Bundle.main.bundleIdentifier, let own = Application(bundleIdentifier: id).token { apps.remove(own) }
                guard authorized, apps.count <= 50, editing || !apps.isEmpty else {
                    clearSession(); call.reject("Choose a distracting app to pause."); return
                }
                if !editing {
                    store.shield.applications = apps
                    guard store.shield.applications == apps else {
                        clearSession(); call.reject("Couldn’t pause your selected apps. Try again."); return
                    }
                }
                if remember {
                    do { try saveApps(apps, viewer: viewer) }
                    catch { clearSession(); call.reject("Couldn’t save your choices on this iPhone. Try again."); return }
                }
                if editing { clearSession() }
                else { picker?.dismiss(animated: true); picker = nil }
                call.resolve(["started": !editing, "paused": editing ? 0 : apps.count, "saved": apps.count])
                changed()
            }
            let saved = savedApps(viewer)
            if !editing, let saved, !saved.isEmpty { complete(saved, remember: false); return }
            guard let controller = bridge?.viewController, controller.viewIfLoaded?.window != nil,
                  controller.presentedViewController == nil else {
                pending = nil; clearSession(); call.reject("Couldn’t open the app picker. Try again."); return
            }
            var initial = FamilyActivitySelection()
            initial.applicationTokens = saved ?? []
            let view = FocusAppPicker(selection: initial, editing: editing, cancel: { [weak self] in self?.clearSession() },
                                      start: { complete($0, remember: true) })
            let host = UIHostingController(rootView: view)
            host.isModalInPresentation = true
            picker = host
            controller.present(host, animated: true)
        }
    }
}
