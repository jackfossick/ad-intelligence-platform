import type { Metadata } from "next";
import "./globals.css";
import { DbProvider } from "@/lib/db-context";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Ad Intelligence",
  description: "Internal creative intelligence and ad replication tool",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DbProvider>
          <div style={{ display: "flex", minHeight: "100vh" }}>
            <Sidebar />
            <main style={{ marginLeft: 220, flex: 1, padding: "28px 32px", minHeight: "100vh" }}>
              {children}
            </main>
          </div>
        </DbProvider>
      </body>
    </html>
  );
}
