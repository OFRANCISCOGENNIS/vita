import Link from "next/link";

// 404 com a cara do produto (o export estático gera out/404.html a partir daqui;
// o GitHub Pages serve esse arquivo para qualquer rota desconhecida).
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0a0a0f] px-6 text-center">
      <p className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-7xl font-black text-transparent">
        404
      </p>
      <div>
        <h1 className="text-xl font-bold text-white">Essa cena ficou de fora do corte</h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          A página que você procurou não existe ou foi movida. Volte para o editor e continue de onde parou.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/app"
          className="inline-flex h-11 items-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Ir para o painel
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-xl border border-zinc-700 px-5 text-sm font-medium text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Página inicial
        </Link>
      </div>
    </main>
  );
}
