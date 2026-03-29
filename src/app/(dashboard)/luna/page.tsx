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
  ChevronRight,
  MessageSquare,
  Trash2,
  Moon,
  Bot,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'completed';
  metadata?: {
    tasksCreated?: number;
    tasksUpdated?: number;
    epicsAnalyzed?: number;
  };
}

interface QuickAction {
  label: string;
  prompt: string;
  icon: React.ReactNode;
  description: string;
}

const quickActions: QuickAction[] = [
  { 
    label: 'Status Geral', 
    prompt: 'Como estão meus projetos? O que precisa de atenção?',
    icon: <Moon className="w-4 h-4" />,
    description: 'Visão geral dos projetos'
  },
  { 
    label: 'Próximas Tasks', 
    prompt: 'Quais tasks devo focar hoje? Liste as mais importantes.',
    icon: <Sparkles className="w-4 h-4" />,
    description: 'Priorização inteligente'
  },
  { 
    label: 'Bugs Críticos', 
    prompt: 'Tem algum bug crítico ou bloqueio que preciso resolver?',
    icon: <Bot className="w-4 h-4" />,
    description: 'Identificar problemas'
  },
  { 
    label: 'Criar Task', 
    prompt: 'Vou descrever uma task pra você criar. Pronta?',
    icon: <MessageSquare className="w-4 h-4" />,
    description: 'Brain dump → task estruturada'
  },
];

const STORAGE_KEY = 'luna-hub-messages';

export default function LunaHubPage() {
  const { profile } = useAuth();
  
  // Carrega mensagens do localStorage ou usa mensagem de boas-vindas
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
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
        content: `🌙 Olá! Sou a Luna, sua assistente geral.\n\nSou o hub central do time de bots. Posso te ajudar com:\n\n• **Visão geral** dos seus projetos\n• **Priorização** de tarefas\n• **Análise** de riscos e bloqueios\n• **Criação** de tasks (brain dump → estruturado)\n• **Orquestração** de bots especialistas\n\nTambém tenho acesso direto ao JT-KILL via MCP, então posso criar, atualizar e analisar suas tasks em tempo real!\n\nComo posso ajudar hoje?`,
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

  // Polling para verificar respostas pendentes
  useEffect(() => {
    if (pendingMessages.size === 0) return;

    const interval = setInterval(async () => {
      for (const messageId of pendingMessages) {
        try {
          const res = await fetch(`/api/luna/chat?messageId=${messageId}`);
          const data = await res.json();
          
          if (data.status === 'completed' && data.reply) {
            setMessages(prev => prev.map(msg => 
              msg.id === messageId 
                ? { 
                    ...msg, 
                    content: data.reply, 
                    status: 'completed',
                    metadata: data.metadata 
                  }
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
    }, 2000); // Poll a cada 2 segundos

    return () => clearInterval(interval);
  }, [pendingMessages]);

  const handleClearHistory = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `🌙 Histórico limpo! Olá novamente, sou a Luna. Como posso ajudar?`,
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
      const res = await fetch('/api/luna/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: input,
          userId: profile?.id || 'guilherme'
        }),
      });

      const data = await res.json();

      // Se já retornou resposta completa, mostra direto
      if (data.status === 'completed' && data.reply) {
        const lunaMessage: Message = {
          id: data.messageId || `reply_${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          timestamp: new Date(),
          status: 'completed'
        };
        setMessages(prev => [...prev, lunaMessage]);
      } 
      // Se está pendente, adiciona ao polling
      else if (data.messageId) {
        const lunaMessage: Message = {
          id: data.messageId,
          role: 'assistant',
          content: '🌙 Luna está pensando...',
          timestamp: new Date(),
          status: 'pending'
        };
        setMessages(prev => [...prev, lunaMessage]);
        setPendingMessages(prev => new Set(prev).add(data.messageId));
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
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Moon className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Luna Hub</h1>
            <p className="text-sm text-muted-foreground">
              Hub central de orquestração • Assistente geral
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
          <Badge variant="default" className="gap-1 bg-indigo-600">
            <Moon className="w-3 h-3" />
            GLM-5
          </Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 h-full">
        {/* Chat Principal */}
        <Card className="lg:col-span-2 flex flex-col h-full">
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4" />
              Conversa com Luna
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
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        {message.status === 'pending' ? (
                          <Moon className="text-white animate-pulse" size={16} />
                        ) : (
                          <Moon className="text-white" size={16} />
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
                      
                      {/* Metadata */}
                      {message.metadata && message.role === 'assistant' && (
                        <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                          {message.metadata.tasksCreated && message.metadata.tasksCreated > 0 && (
                            <span className="mr-2">✅ {message.metadata.tasksCreated} tasks criadas</span>
                          )}
                          {message.metadata.tasksUpdated && message.metadata.tasksUpdated > 0 && (
                            <span className="mr-2">📝 {message.metadata.tasksUpdated} tasks atualizadas</span>
                          )}
                          {message.metadata.epicsAnalyzed && message.metadata.epicsAnalyzed > 0 && (
                            <span>🔍 {message.metadata.epicsAnalyzed} epics analisados</span>
                          )}
                        </div>
                      )}
                      
                      <div className={cn(
                        "text-xs mt-1 flex items-center gap-1",
                        message.role === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {message.status === 'pending' && message.role === 'assistant' ? (
                          <>
                            <span>Luna está pensando</span>
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
                  className="w-full justify-start gap-2 h-auto py-2"
                  onClick={() => handleQuickAction(action)}
                  disabled={isLoading}
                >
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-2">
                      {action.icon}
                      {action.label}
                    </div>
                    <span className="text-xs text-muted-foreground">{action.description}</span>
                  </div>
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
                <span className="text-sm">Conexão OpenClaw</span>
                <Badge variant="default" className="gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Online
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">MCP JT-KILL</span>
                <Badge variant="default" className="gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Conectado
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
              <p>🌙 Luna é a generalista do time de bots.</p>
              <p>🔌 Integração via OpenClaw MCP.</p>
              <p>⚡ Pode criar/atualizar tasks em tempo real.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
