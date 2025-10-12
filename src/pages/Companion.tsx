import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Send, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: number;
  question: string;
  answer: string;
  context: string;
  timestamp: string;
}

const Companion = () => {
  const { toast } = useToast();
  const [showTitle, setShowTitle] = useState("");
  const [episode, setEpisode] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleAskQuestion = async () => {
    if (!question.trim()) {
      toast({
        title: "Question required",
        description: "Please enter a question about the show",
        variant: "destructive"
      });
      return;
    }

    if (!showTitle.trim() || !episode.trim() || !timestamp.trim()) {
      toast({
        title: "Context required",
        description: "Please fill in show title, episode, and timestamp",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('spoiler-free-companion', {
        body: {
          showTitle,
          episode,
          timestamp,
          question
        }
      });

      if (error) throw error;

      const newMessage: Message = {
        id: messages.length + 1,
        question: question,
        answer: data.answer,
        context: `${episode} @ ${timestamp}`,
        timestamp: "Just now"
      };

      setMessages([newMessage, ...messages]);
      setQuestion("");
      
      toast({
        title: "Answer received",
        description: "Spoiler-free response generated!",
      });
    } catch (error) {
      console.error('Error asking question:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get answer. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
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
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Ask Question
            </>
          )}
        </Button>
      </Card>

      {/* Messages */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Previous Questions</h3>
        {messages.length === 0 ? (
          <Card className="p-6 text-center bg-card border-border">
            <p className="text-muted-foreground">
              No questions yet. Ask your first spoiler-free question!
            </p>
          </Card>
        ) : (
          messages.map((msg) => (
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
          ))
        )}
      </div>
    </div>
  );
};

export default Companion;
