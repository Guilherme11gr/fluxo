import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Target,
  Users,
  Zap,
  Shield,
  BarChart3,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FluXo — Experimento",
  description:
    "Gerenciamento de projetos de engenharia com inteligência artificial. Simples, rápido, sem atrito.",
};

const BENEFITS = [
  {
    icon: Brain,
    title: "AI Scribe",
    description:
      "Transforme anotações soltas em tasks técnicas estruturadas automaticamente. A IA entende contexto e prioriza pra você.",
  },
  {
    icon: Target,
    title: "Workflow sem atrito",
    description:
      "BACKLOG → TODO → DOING → REVIEW → DONE. Fluxo validado, zero configuração. Seu time foca no que importa.",
  },
  {
    icon: Users,
    title: "Estimativa colaborativa",
    description:
      "Scrum Poker realtime dentro do contexto da task. Votos ocultos até revelar — sem bias, sem ruído.",
  },
];

const PROOFS = [
  { name: "Equipe Alpha", role: "Engenharia Backend", quote: "Reduziu 40% do tempo gasto em status updates." },
  { name: "Time Delta", role: "Produto & Design", quote: "Finalmente um board que a gente não precisa configurar." },
  { name: "Squad Omega", role: "Plataforma & Infra", quote: "O AI Scribe mudou como escrevemos requirements." },
];

const FAQS = [
  {
    q: "O que é o FluXo?",
    a: "Um gerenciador de projetos opinionado para times de engenharia. Workflow pronto, IA integrada, zero configuração.",
  },
  {
    q: "Preciso configurar algo pra começar?",
    a: "Não. O workflow já vem definido com as colunas certas. Você cria o projeto e começa a usar.",
  },
  {
    q: "O AI Scribe funciona bem em português?",
    a: "Sim. O Scribe processa notas em pt-BR e gera tasks estruturadas no idioma do seu time.",
  },
  {
    q: "Posso usar grátis?",
    a: "O experimento é gratuito. Estamos validando o produto com times reais antes do lançamento público.",
  },
];

function BenefitCard({ icon: Icon, title, description }: (typeof BENEFITS)[number] & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02] border-border/50">
      <CardHeader>
        <Icon className="w-10 h-10 text-primary mb-2" />
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function ExperimentPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <header className="container mx-auto px-6 pt-24 pb-16 text-center">
        <Badge variant="pulse" className="mb-6">
          Experimento Público
        </Badge>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          Projetos de engenharia
          <br />
          <span className="text-muted-foreground">sem atrito.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Workflow pronto, IA que estrutura suas ideias e estimativa colaborativa.
          Tudo em um lugar, zero configuração.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup">
            <Button size="lg" className="gap-2">
              <Zap className="w-4 h-4" />
              Participar do experimento
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <a href="#beneficios">
            <Button size="lg" variant="outline">
              Saiba mais
              <ChevronDown className="w-4 h-4" />
            </Button>
          </a>
        </div>
      </header>

      {/* Benefits */}
      <section id="beneficios" className="container mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Por que times escolhem o FluXo
        </h2>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {BENEFITS.map((b) => (
            <BenefitCard key={b.title} {...b} />
          ))}
        </div>
      </section>

      {/* Metrics / Differentiators */}
      <section className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto text-center">
          <div>
            <Shield className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="text-3xl font-bold">0</p>
            <p className="text-sm text-muted-foreground">configurações obrigatórias</p>
          </div>
          <div>
            <BarChart3 className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="text-3xl font-bold">6</p>
            <p className="text-sm text-muted-foreground">colunas de workflow validadas</p>
          </div>
          <div>
            <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="text-3xl font-bold">&lt;2s</p>
            <p className="text-sm text-muted-foreground">pra criar uma task com AI Scribe</p>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="container mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          O que os times estão dizendo
        </h2>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PROOFS.map((p) => (
            <Card key={p.name} className="border-border/50">
              <CardContent className="pt-6">
                <p className="text-lg mb-4 italic">&ldquo;{p.quote}&rdquo;</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {p.name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-6 py-16 max-w-3xl">
        <h2 className="text-3xl font-bold text-center mb-12">
          Perguntas frequentes
        </h2>
        <div className="space-y-4">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group bg-card border border-border/50 rounded-xl p-4"
            >
              <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                {faq.q}
                <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
              </summary>
              <p className="text-muted-foreground mt-3 text-sm">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA Final */}
      <section className="container mx-auto px-6 py-24 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Pronto pra experimentar?
        </h2>
        <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
          Junte-se ao experimento e ajude a moldar o futuro do gerenciamento de projetos de engenharia.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup">
            <Button size="lg" className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Começar agora — é grátis
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-6">
          Stack: Next.js • TypeScript • Supabase • Tailwind CSS • Shadcn/UI
        </p>
      </section>
    </div>
  );
}