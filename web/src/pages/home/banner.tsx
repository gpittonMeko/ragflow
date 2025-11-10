export function Banner() {
  return (
    <section className="my-8 rounded-2xl bg-gradient-to-r from-[#1a1033] via-[#0b0b1f] to-[#06060d] px-8 py-12 text-white shadow-[0_20px_60px_rgba(18,16,37,0.45)]">
      <div className="grid gap-10 lg:grid-cols-[3fr,2fr]">
        <div className="flex flex-col justify-center gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
            Assistente AI Tributario
          </span>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            SGAI Legal: l&apos;AI specializzata che affianca avvocati e studi
            tributari italiani
          </h1>
          <p className="max-w-2xl text-base text-white/70 md:text-lg">
            Analizziamo oltre 50.000 sentenze tributarie, prassi
            dell&apos;Agenzia delle Entrate e giurisprudenza aggiornata per
            produrre atti, ricorsi e pareri documentati in pochi minuti. Pensato
            per avvocati, commercialisti e tax manager che vogliono superare le
            soluzioni generiche come Lextel AI, Lexroom e Simpliciter.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="https://www.sgailegal.com/login"
              className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#141124] shadow-lg shadow-white/20 transition hover:translate-y-[-2px] hover:bg-slate-100"
            >
              Prova gratuita — 5 domande al giorno
            </a>
            <a
              href="https://calendly.com/"
              className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:border-white"
            >
              Prenota una demo guidata
            </a>
          </div>
          <dl className="grid gap-4 text-sm text-white/70 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-widest text-white/50">
                Corpus giuridico
              </dt>
              <dd className="text-lg font-semibold text-white">
                50.000+ documenti
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-white/50">
                Tempo medio di ricerca
              </dt>
              <dd className="text-lg font-semibold text-white">37 secondi</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-white/50">
                Studi che ci hanno scelto
              </dt>
              <dd className="text-lg font-semibold text-white">120+</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col justify-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
          <h2 className="text-xl font-semibold text-white">
            Perché gli studi legali scelgono SGAI Legal
          </h2>
          <ul className="space-y-3 text-sm text-white/70">
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
              <span>
                <strong className="text-white">
                  Motore RAG fiscale proprietario
                </strong>{' '}
                con fonti verificate, citazioni puntuali e export in Word/PDF.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
              <span>
                <strong className="text-white">
                  Workflow pensati per studi tributari
                </strong>
                : memorie, counterclaim, pareri, lettere di compliance.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
              <span>
                <strong className="text-white">
                  Compliance GDPR & hosting UE
                </strong>{' '}
                con audit trail completo e studio delle conversazioni in
                dashboard.
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-white/40">
            Confrontati con Lextel AI, Lexroom, Simpliciter.ai e vinci sulla
            velocità e qualità delle fonti.
          </p>
        </div>
      </div>
    </section>
  );
}
