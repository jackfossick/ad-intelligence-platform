export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Environment and configuration info.</p>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-medium text-gray-800 mb-3">Environment Variables</h2>
          <p className="text-sm text-gray-500 mb-3">These are set in your <code className="bg-gray-100 px-1 rounded">.env</code> file in the project root. Never commit real values to git.</p>
          <div className="space-y-2 text-sm font-mono">
            <EnvRow name="APIFY_TOKEN" set={!!process.env.APIFY_TOKEN} />
            <EnvRow name="DATABASE_URL" set={!!process.env.DATABASE_URL} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-medium text-gray-800 mb-3">Database</h2>
          <p className="text-sm text-gray-500">SQLite database stored locally at <code className="bg-gray-100 px-1 rounded">./dev.db</code>. Run <code className="bg-gray-100 px-1 rounded">npx prisma studio</code> from the terminal to browse the database directly.</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-medium text-gray-800 mb-3">Useful Commands</h2>
          <div className="space-y-1.5 text-sm font-mono text-gray-700">
            <p><span className="text-gray-400">$ </span>npm run dev — start the app</p>
            <p><span className="text-gray-400">$ </span>npm run scrape — run an Apify scrape</p>
            <p><span className="text-gray-400">$ </span>npm run normalize — normalize raw data</p>
            <p><span className="text-gray-400">$ </span>npm run export-csv — export database to CSV</p>
            <p><span className="text-gray-400">$ </span>npx prisma studio — browse database in browser</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnvRow({ name, set }: { name: string; set: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
      <span className="text-gray-700">{name}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${set ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {set ? "set" : "not set"}
      </span>
    </div>
  );
}
