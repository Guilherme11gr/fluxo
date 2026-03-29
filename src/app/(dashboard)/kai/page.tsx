'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  User, 
  Loader2, 
  BarChart3, 
  ChevronRight,
  MessageSquare,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { BotIcon } from '@/components/ui/bot';
import { SparklesIcon } from '@/components/ui/sparkles';
import { ZapIcon } from '@/components/ui/zap';
import { BrainIcon } from '@/components/ui/brain';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'completed';
}

interface QuickAction {
  label: string;
  prompt: string;
  icon: React.ReactNode;
}

const quickActions: QuickAction[] = [
  { 
    label: 'Análise do dia', 
    prompt: 'Faça uma análise dos meus projetos hoje. O que está crítico?',
    icon: <BrainIcon size={18} />
  },
  { 
    label: 'Tasks prioritárias', 
    prompt: 'Quais são as 3 tasks mais importantes pra eu fazer agora?',
    icon: <ZapIcon size={18} />
  },
  { 
    label: 'Bloqueios', 
    prompt: 'Tem alguma task travada que precisa de atenção?',
    icon: <MessageSquare className="w-4 h-4" />
  },
];

const STORAGE_KEY = 'kai-zone-messages';

export default function KaiZonePage() {
  const { profile } = useAuth();
  
  // Carrega mensagens do localStorage ou usa mensagem de boas-vindas
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Converte strings de data de volta para Date
          return parsed.map((m: Message) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
        } catch {
          // fallback para mensagem padrão
        }
      }
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: `Olá! Sou o Kai, seu assistente no Jira Killer.\n\nAgora você pode conversar comigo aqui! Suas mensagens serão processadas e eu respondo em breve.\n\nPosso te ajudar com:\n• Análise de projetos e tasks\n• Priorização do que fazer\n• Identificar bloqueios\n• Documentar decisões\n\nO que você precisa hoje?`,
        timestamp: new Date(),
        status: 'completed'
      }
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll pro final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Salva mensagens no localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Polling pra verificar respostas pendentes
  useEffect(() => {
    if (pendingMessages.size === 0) return;

    const interval = setInterval(async () => {
      for (const messageId of pendingMessages) {
        try {
          const res = await fetch(`/api/kai/chat?messageId=${messageId}`);
          const data = await res.json();
          
          if (data.status === 'completed' && data.reply) {
            setMessages(prev => prev.map(msg => 
              msg.id === messageId 
                ? { ...msg, content: data.reply, status: 'completed' }
                : msg
            ));
            setPendingMessages(prev => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
          }
        } catch (err) {
          console.error('Erro no polling:', err);
        }
      }
    }, 1000); // Poll a cada 1 segundo (mais rápido)

    return () => clearInterval(interval);
  }, [pendingMessages]);

  const handleClearHistory = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Histórico limpo! Olá novamente, sou o Kai. Como posso ajudar?`,
          timestamp: new Date(),
          status: 'completed'
        }
      ]);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const tempId = `temp_${Date.now()}`;
    const userMessage: Message = {
      id: tempId,
      role: 'user',
      content: input,
      timestamp: new Date(),
      status: 'completed'
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Tenta enviar via Telegram proxy primeiro
      const telegramRes = await fetch('/api/kai/telegram-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: input,
          messageId: tempId
        }),
      });

      if (telegramRes.ok) {
        // Telegram funcionou, aguarda resposta
        const kaiMessage: Message = {
          id: tempId,
          role: 'assistant',
          content: '📤 Mensagem enviada pro Telegram. Kai vai responder lá e aparece aqui em breve...',
          timestamp: new Date(),
          status: 'pending'
        };
        setMessages(prev => [...prev, kaiMessage]);
        setPendingMessages(prev => new Set(prev).add(tempId));
      } else {
        // Fallback pro método normal
        const res = await fetch('/api/kai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: input,
            userId: profile?.id || 'guilherme'
          }),
        });

        const data = await res.json();

        if (data.messageId) {
          const kaiMessage: Message = {
            id: data.messageId,
            role: 'assistant',
            content: '🤔 Kai está pensando...',
            timestamp: new Date(),
            status: 'pending'
          };
          setMessages(prev => [...prev, kaiMessage]);
          setPendingMessages(prev => new Set(prev).add(data.messageId));
        }
      }
    } catch (error) {
      console.error('Erro ao enviar:', error);
      setMessages(prev => [...prev, {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: '❌ Erro ao enviar mensagem. Tente novamente.',
        timestamp: new Date(),
        status: 'completed'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    setInput(action.prompt);
  };

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center">
            <AnimatedIcon name="bot" className="text-primary-foreground" size={24} interval={3000} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kai Zone</h1>
            <p className="text-sm text-muted-foreground">
              Converse com seu assistente inteligente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearHistory}
            className="gap-1 text-muted-foreground"
            title="Limpar histórico"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Limpar</span>
          </Button>
          <Badge variant="secondary" className="gap-1">
            <AnimatedIcon name="sparkles" size={14} interval={2000} />
            Beta
          </Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 h-full">
        {/* Chat Principal */}
        <Card className="lg:col-span-2 flex flex-col h-full">
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4" />
              Conversa com Kai
            </CardTitle>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col p-0">
            {/* Mensagens */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                        {message.status === 'pending' ? (
                          <AnimatedIcon name="bot" className="text-primary-foreground" size={16} interval={1000} />
                        ) : (
                          <BotIcon className="text-primary-foreground" size={16} />
                        )}
                      </div>
                    )}
                    
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2 text-sm",
                        message.role === 'user'
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      <div className={cn(
                        "text-xs mt-1 flex items-center gap-1",
                        message.role === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {message.status === 'pending' && message.role === 'assistant' ? (
                          <>
                            <span>Kai está digitando</span>
                            <span className="flex gap-0.5 ml-1">
                              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </>
                        ) : (
                          <>
                            {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </>
                        )}
                      </div>
                    </div>

                    {message.role === 'user' && (
                      <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Pergunte algo sobre seus projetos..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar de Ações */}
        <div className="space-y-4">
          {/* Ações Rápidas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => handleQuickAction(action)}
                  disabled={isLoading}
                >
                  {action.icon}
                  {action.label}
                  <ChevronRight className="w-4 h-4 ml-auto" />
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Conexão</span>
                <Badge variant="default" className="gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Online
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Mensagens pendentes</span>
                <Badge variant="secondary">{pendingMessages.size}</Badge>
              </div>
            </CardContent>          
          </Card>

          {/* Info */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4 text-xs text-muted-foreground space-y-2">
              <p>💡 Kai processa suas mensagens via MCP.</p>
              <p>⏱️ Respostas em até 30 segundos.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
