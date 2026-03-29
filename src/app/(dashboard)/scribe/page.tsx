import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ScribePage() {
  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">AI Scribe</h1>
        <p className="text-muted-foreground">Converse com o Fluxo e opere o app usando as tools reais do produto</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assistente conversacional</CardTitle>
          <CardDescription>
            O botão flutuante no canto da tela abre o agent. Ele já conversa em linguagem natural e escolhe tools para consultar ou alterar o Fluxo dentro do tenant atual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Exemplos para testar:</p>
          <p>"Liste minhas tasks em DOING e me diga o que está bloqueado."</p>
          <p>"Crie uma feature no épico X para exportação em CSV."</p>
          <p>"Abra a task JKILL-123 e adicione um comentário com o plano de implementação."</p>
          <p>"Mostre o contexto completo do épico Y e sugira a próxima sequência de execução."</p>
        </CardContent>
      </Card>
    </div>
  );
}
