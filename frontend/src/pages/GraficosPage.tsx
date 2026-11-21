import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Carregando, Erro, Vazio } from '../components/feedback';
import { useFechadura } from '../contexts/FechaduraContext';
import { useAgora, useDados } from '../hooks/useDados';
import { api } from '../services/api';
import { formatarHora } from '../utils/format';

const JANELA_MS = 10 * 60 * 1000;

function GraficoDistancia() {
  const { amostras, versoes } = useFechadura();
  const agora = useAgora(2000);
  const historico = useDados(() => api.leituras(10), []);
  const config = useDados(() => api.configuracao(), [versoes.configuracao]);

  // Leituras salvas (1 a cada 5 s) + amostras ao vivo que chegam pelo SSE (a cada 2 s)
  const pontos = useMemo(() => {
    const salvas = (historico.dados ?? []).map((l) => ({ t: new Date(l.criadoEm).getTime(), cm: l.distanciaCm }));
    return [...salvas, ...amostras]
      .filter((p) => p.t >= agora - JANELA_MS)
      .sort((a, b) => a.t - b.t);
  }, [historico.dados, amostras, agora]);

  if (historico.carregando && !historico.dados) return <Carregando />;
  if (historico.erro && !historico.dados) return <Erro mensagem={historico.erro} tentarDeNovo={historico.recarregar} />;
  if (pontos.length === 0) return <Vazio>Nenhuma leitura nos últimos 10 minutos.</Vazio>;

  const limite = config.dados?.limiteCm;
  return (
    <div className="grafico" role="img" aria-label="Distância do sensor nos últimos 10 minutos">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={pontos} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" />
          <XAxis
            dataKey="t"
            type="number"
            domain={[agora - JANELA_MS, agora]}
            tickFormatter={(t) => formatarHora(t)}
            tick={{ fill: 'var(--texto-suave)', fontSize: 12 }}
            tickCount={6}
          />
          <YAxis unit=" cm" tick={{ fill: 'var(--texto-suave)', fontSize: 12 }} allowDecimals={false} width={64} />
          <Tooltip
            labelFormatter={(t) => formatarHora(Number(t))}
            formatter={(v) => [v === null ? 'sem eco' : `${v} cm`, 'Distância']}
            contentStyle={{ background: 'var(--superficie)', border: '1px solid var(--borda)', borderRadius: 8 }}
          />
          {limite !== undefined && (
            <ReferenceLine
              y={limite}
              stroke="var(--ok)"
              strokeDasharray="6 4"
              label={{ value: `fechada ≤ ${limite} cm`, position: 'insideTopRight', fill: 'var(--ok)', fontSize: 12 }}
            />
          )}
          <Line type="monotone" dataKey="cm" stroke="var(--primaria)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function GraficoAcessos() {
  const { versoes } = useFechadura();
  const { dados, erro, carregando, recarregar } = useDados(() => api.acessosPorHora(), [versoes.eventos]);

  if (carregando && !dados) return <Carregando />;
  if (erro && !dados) return <Erro mensagem={erro} tentarDeNovo={recarregar} />;
  const total = (dados ?? []).reduce((s, h) => s + h.liberados + h.negados, 0);
  if (total === 0) return <Vazio>Nenhuma tentativa de acesso hoje.</Vazio>;

  return (
    <div className="grafico" role="img" aria-label="Acessos liberados e negados por hora hoje">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={dados ?? []} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" vertical={false} />
          <XAxis dataKey="hora" tickFormatter={(h) => `${h}h`} tick={{ fill: 'var(--texto-suave)', fontSize: 12 }} interval={2} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--texto-suave)', fontSize: 12 }} />
          <Tooltip
            labelFormatter={(h) => `${h}h – ${Number(h) + 1}h`}
            contentStyle={{ background: 'var(--superficie)', border: '1px solid var(--borda)', borderRadius: 8 }}
            cursor={{ fill: 'var(--fundo)' }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="liberados" name="Liberados" fill="var(--ok)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="negados" name="Negados" fill="var(--perigo)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficosPage() {
  return (
    <div className="pilha">
      <section className="cartao">
        <h3>Distância do sensor · últimos 10 min</h3>
        <p className="muted pequeno">Atualiza ao vivo. Abaixo da linha tracejada, a porta conta como fechada.</p>
        <GraficoDistancia />
      </section>
      <section className="cartao">
        <h3>Acessos por hora · hoje</h3>
        <GraficoAcessos />
      </section>
    </div>
  );
}
