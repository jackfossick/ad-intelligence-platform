import type { Metadata } from "next";
import "./globals.css";
import { DbProvider } from "@/lib/db-context";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Ad Intelligence",
  description: "Internal creative intelligence and ad replication tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "#f8f8f6" }}>
        <DbProvider>
          <div style={{ display: "flex", minHeight: "100vh" }}>
            <Sidebar />
            <div style={{ marginLeft: SIDEBAR_WIDTH, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
              <TopBar />
              <main style={{ flex: 1, padding: "18px", overflow: "auto" }}>
                {children}
              </main>
            </div>
          </div>
        </DbProvider>
      </body>
    </html>
  );
}
