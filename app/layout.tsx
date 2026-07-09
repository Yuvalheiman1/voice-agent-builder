import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "VoiceBuilder - Voice AI Outreach",
  description: "Build a voice AI agent that calls your leads, qualifies them, and books meetings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} h-full`}>
      <body className="min-h-dvh">
        <div className="blobs" aria-hidden="true">
          <div className="blob" style={{ width: 340, height: 340, top: -90, left: -120, background: "radial-gradient(circle at 35% 30%,#c4b5fd,#8b5cf6)" }} />
          <div className="blob" style={{ width: 260, height: 260, top: "18%", right: -110, background: "radial-gradient(circle at 35% 30%,#fbcfe8,#f472b6)" }} />
          <div className="blob" style={{ width: 200, height: 200, bottom: "8%", left: -70, background: "radial-gradient(circle at 35% 30%,#fde68a,#fbbf24)" }} />
          <div className="blob" style={{ width: 300, height: 300, bottom: -120, right: -90, background: "radial-gradient(circle at 35% 30%,#ddd6fe,#a78bfa)" }} />
        </div>
        {children}
      </body>
    </html>
  );
}
