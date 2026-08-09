export default function LayoutAutenticacao({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo — só em ecrãs grandes */}
      <aside className="relative hidden w-1/2 flex-col justify-between bg-navy-600 p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative">
          <p className="text-sm font-medium uppercase tracking-widest text-brand-300">
            CargoFlow
          </p>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">
            A logística inteligente
            <br />
            <span className="text-brand-400">começa aqui.</span>
          </h2>
          <p className="mt-5 text-navy-100">
            Ligamos quem tem carga a quem tem espaço no camião. Menos viagens em
            vazio, mais rendimento por quilómetro.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-8">
            {[
              ['Cargas', 'publicadas e encontradas'],
              ['Rotas', 'otimizadas por corredor'],
              ['Entregas', 'seguidas em tempo real'],
            ].map(([titulo, desc]) => (
              <div key={titulo}>
                <dt className="text-sm font-semibold text-white">{titulo}</dt>
                <dd className="mt-1 text-xs leading-relaxed text-navy-200">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-navy-300">
          © {new Date().getFullYear()} CargoFlow · Benguela, Angola
        </p>
      </aside>

      {/* Formulário */}
      <main className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        {children}
      </main>
    </div>
  );
}
