export function Applications() {
  const workflows = [
    {
      title: 'Memorie difensive e ricorsi tributari',
      description:
        'Genera bozze strutturate con motivazioni, riferimenti giurisprudenziali e allegati pronti per Word/PDF. Ideale per contenzioso Agenzia Entrate.',
      tag: 'Avvocati tributaristi',
    },
    {
      title: 'Pareri fiscali documentati',
      description:
        'Analisi combinata di normativa, prassi e giurisprudenza recente per fornire pareri scritti con citazioni puntuali e sintesi executive.',
      tag: 'Commercialisti e tax manager',
    },
    {
      title: 'Due diligence e controlli anti-accertamento',
      description:
        'Workflow guidati per verificare rischi IVA, imposte dirette, dogane e predisporre lettere di compliance personalizzate in pochi minuti.',
      tag: 'Dipartimenti legali aziendali',
    },
    {
      title: 'Aggiornamenti normativi automatici',
      description:
        'Monitoraggio di Cassazione, CTR/CTP e provvedimenti Agenzia Entrate con alert personalizzati e riassunti pronti da condividere con il team.',
      tag: 'Knowledge management',
    },
  ];

  return (
    <section className="mt-12 space-y-10">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold text-white">
          Workflow pronti per gli studi legali tributari
        </h2>
        <p className="max-w-3xl text-sm text-white/70 md:text-base">
          SGAI Legal accelera il lavoro quotidiano di avvocati, tax manager e
          commercialisti con processi ottimizzati per diritto tributario e
          doganale. Ogni workflow integra ricerca giurisprudenziale, check
          normativi e automazione documentale.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {workflows.map((workflow) => (
          <div
            key={workflow.title}
            className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur transition hover:-translate-y-1 hover:border-white/30"
          >
            <span className="inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-white/60">
              {workflow.tag}
            </span>
            <h3 className="text-xl font-semibold">{workflow.title}</h3>
            <p className="text-sm text-white/70 md:text-base">
              {workflow.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
