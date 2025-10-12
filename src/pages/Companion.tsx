import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Send, Clock } from "lucide-react";

interface Message {
  id: number;
  question: string;
  answer: string;
  context: string;
  timestamp: string;
}

const Companion = () => {
  const [showTitle, setShowTitle] = useState("");
  const [episode, setEpisode] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      question: "Who is the main character?",
      answer: "Based on what you've seen so far, the main character is introduced as a mysterious figure with a complex past. More details will unfold as you continue watching!",
      context: "S1E1 @ 00:15:30",
      timestamp: "2 mins ago"
    }
  ]);

  const handleAskQuestion = () => {
    if (!question.trim()) return;

    const newMessage: Message = {
      id: messages.length + 1,
      question: question,
      answer: "This is a demo version. In the full app, AI will analyze your show up to the timestamp you specified and provide spoiler-free context!",
      context: episode && timestamp ? `${episode} @ ${timestamp}` : "Context not set",
      timestamp: "Just now"
    };

    setMessages([newMessage, ...messages]);
    setQuestion("");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold mb-2">Spoiler-Free Companion</h2>
        <p className="text-muted-foreground">
          Ask questions about your show without spoilers
        </p>
      </div>

      {/* Input Section */}
      <Card className="p-4 space-y-4 bg-gradient-to-br from-card to-secondary border-border">
        <div className="grid grid-cols-2 gap-3">
          <Input
            placeholder="Show title"
            value={showTitle}
            onChange={(e) => setShowTitle(e.target.value)}
            className="bg-background/50"
          />
          <Input
            placeholder="S1E2"
            value={episode}
            onChange={(e) => setEpisode(e.target.value)}
            className="bg-background/50"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="00:27:45"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            className="bg-background/50"
          />
        </div>

        <div className="flex gap-2">
          <Textarea
            placeholder="Ask a question about the story so far..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[80px] bg-background/50"
          />
        </div>

        <Button 
          onClick={handleAskQuestion}
          className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
        >
          <Send className="h-4 w-4 mr-2" />
          Ask Question
        </Button>
      </Card>

      {/* Messages */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Previous Questions</h3>
        {messages.map((msg) => (
          <Card key={msg.id} className="p-4 space-y-3 bg-card border-border hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium text-foreground">{msg.question}</p>
                <p className="text-sm text-muted-foreground mt-2">{msg.answer}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
              <span className="px-2 py-1 bg-secondary rounded text-primary font-mono">
                {msg.context}
              </span>
              <span>{msg.timestamp}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Companion;
