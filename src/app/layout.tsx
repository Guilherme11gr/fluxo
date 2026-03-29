import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query";
import { AuthProvider } from "@/providers/auth-provider";
import { UserCacheProvider } from "@/providers/user-cache-provider";
import { PermissionsProvider } from "@/providers/permissions-provider";
import { RealtimeProvider } from "@/providers/realtime-provider";
import { ActivityToastsProvider } from "@/providers/activity-toasts-provider";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FluXo",
  description: "Gerenciador de projetos focado em engenharia - Opinionated & Low Friction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <QueryProvider>
          <AuthProvider>
            <UserCacheProvider>
              <PermissionsProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem={false}
                disableTransitionOnChange
              >
                <RealtimeProvider>
                  <ActivityToastsProvider>
                    {children}
                    <Toaster />
                  </ActivityToastsProvider>
                </RealtimeProvider>
              </ThemeProvider>
            </PermissionsProvider>
            </UserCacheProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
