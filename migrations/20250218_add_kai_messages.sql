-- Migration: add_kai_messages
-- Cria tabela para mensagens do Kai Zone

CREATE TABLE IF NOT EXISTS public.kai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    reply TEXT,
    direction VARCHAR(20) NOT NULL DEFAULT 'incoming',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_kai_messages_user ON public.kai_messages(user_id);
CREATE INDEX idx_kai_messages_status ON public.kai_messages(status);
CREATE INDEX idx_kai_messages_created ON public.kai_messages(created_at DESC);

-- Políticas RLS (Row Level Security) - opcional, mas recomendado
ALTER TABLE public.kai_messages ENABLE ROW LEVEL SECURITY;

-- Política: usuários só veem suas próprias mensagens
CREATE POLICY "Users can view own messages" 
    ON public.kai_messages 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Política: usuários só inserem suas próprias mensagens  
CREATE POLICY "Users can insert own messages"
    ON public.kai_messages
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Política: sistema pode atualizar (para o Kai responder)
CREATE POLICY "System can update messages"
    ON public.kai_messages
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.kai_messages IS 'Mensagens do chat Kai Zone';
