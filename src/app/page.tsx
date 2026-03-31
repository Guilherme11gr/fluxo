import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Infinity, Brain, Target, Users, ArrowRight } from "lucide-react";
import { getServerAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerAuthSession();
  const primaryHref = session?.user ? "/projects" : "/login";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <main className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <Badge variant="pulse" className="mb-4">
            MVP em Desenvolvimento
          </Badge>
<h1 className="text-5xl font-bold mb-6 tracking-tight">
          FluXo
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          O futuro do gerenciamento de projetos de engenharia.
          <br />
          <span className="text-foreground font-medium">Inteligente • Simples • Potente</span>
        </p>
          <div className="flex gap-4 justify-center">
            <Link href={primaryHref}>
              <Button size="lg" className="gap-2">
                <Infinity className="w-4 h-4" />
                Começar Agora
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline">
              Ver Documentação
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
            <CardHeader>
              <Brain className="w-10 h-10 text-primary mb-2" />
              <CardTitle>AI Scribe</CardTitle>
              <CardDescription>
                Transforma anotações desestruturadas em tasks técnicas estruturadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Escreva como pensa, a IA estrutura pra você. Staging area para revisão antes de salvar.
              </p>
            </CardContent>
          </Card>

          <Card className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
            <CardHeader>
              <Target className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Workflow Inteligente</CardTitle>
              <CardDescription>
                BACKLOG → TODO → DOING → REVIEW → QA_READY → DONE
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Zero configuração. Fluxo validado e otimizado para equipes de engenharia.
              </p>
            </CardContent>
          </Card>

          <Card className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
            <CardHeader>
              <Users className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Estimativa Colaborativa</CardTitle>
              <CardDescription>
                Scrum Poker sem sair do contexto
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Votação realtime dentro do modal da task. Votos ocultos até revelar.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Status */}
        <div className="text-center mt-16">
          <p className="text-muted-foreground/60 text-sm">
            Stack: Next.js 15 • TypeScript • Supabase • Tailwind CSS • Shadcn/UI
          </p>
        </div>
      </main>
    </div>
  );
}
