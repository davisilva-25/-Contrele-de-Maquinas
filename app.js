// ====== CONFIGURE AQUI (Supabase → Settings → API) ======
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANON';
// ========================================================

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById('app');
const S = {};            // estado da tela atual
let criar = false;       // alterna entrar / criar conta

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('pt-BR');
const dBR = (d) => d.split('-').reverse().join('/');
const hoje = () => new Date().toISOString().slice(0, 10);
const un = (e) => (e.medicao === 'km' ? 'km' : 'h');
const R0 = () => ({ data: hoje(), leitura: '', descricao: '', responsavel: '', custo: '' });
const A0 = () => ({ data: hoje(), leitura: '', litros: '', valor: '' });
const erro = (m) => { const e = document.getElementById('erro'); if (e) e.textContent = m; };
const topo = (esq) => `<header class="top"><div><div class="esq">${esq}</div><button class="sec" data-act="sair">Sair</button></div></header>`;

/* ---------- cálculos ---------- */
function consumoMedio(e, abs) {
  if (abs.length < 2) return null;
  const o = [...abs].sort((x, y) => x.leitura - y.leitura);
  const dist = o[o.length - 1].leitura - o[0].leitura;
  const litros = o.slice(1).reduce((s, x) => s + Number(x.litros), 0);
  if (dist <= 0 || litros <= 0) return null;
  return e.medicao === 'km' ? (dist / litros).toFixed(2) + ' km/L' : (litros / dist).toFixed(2) + ' L/h';
}

function status(e, revs) {
  if (!e.intervalo_revisao) return ['Sem intervalo definido', ''];
  const ult = Math.max(0, ...revs.filter((r) => r.equipamento_id === e.id).map((r) => Number(r.leitura)));
  const falta = ult + Number(e.intervalo_revisao) - Number(e.leitura_atual);
  if (falta <= 0) return ['Revisão vencida há ' + fmt(Math.abs(falta)) + ' ' + un(e), 'red'];
  if (falta <= e.intervalo_revisao * 0.1) return ['Revisão em ' + fmt(falta) + ' ' + un(e), 'amber'];
  return ['Próxima revisão em ' + fmt(falta) + ' ' + un(e), 'green'];
}

/* ---------- telas ---------- */
function viewLogin() {
  app.innerHTML = `<main class="login">
    <div class="faixa"></div>
    <h1 style="margin-top:20px">Controle de Máquinas</h1>
    <p class="muted" style="margin:0 0 20px">Frota, revisões e abastecimento</p>
    <form class="card" data-form="login" style="display:grid;gap:12px">
      <label>E-mail<input name="email" type="email" required></label>
      <label>Senha<input name="senha" type="password" required minlength="6"></label>
      <p class="erro" id="erro"></p>
      <button type="submit">${criar ? 'Criar conta' : 'Entrar'}</button>
      <a href="#" data-act="alt">${criar ? 'Já tenho conta' : 'Criar minha conta'}</a>
    </form></main>`;
}

async function viewPainel() {
  const [e, r] = await Promise.all([
    db.from('equipamentos').select('*').order('nome'),
    db.from('revisoes').select('equipamento_id, leitura'),
  ]);
  const lista = e.data || [], revs = r.data || [];
  S.lista = lista;
  const tipos = ['Retroescavadeira', 'Motoniveladora', 'Caminhão', 'Ônibus', 'Escavadeira', 'Trator', 'Carro', 'Outro'];
  app.innerHTML = topo('<strong>Controle de Máquinas</strong>') + `<main>
    <h2>Equipamentos</h2>
    <div class="acoes">
      <button class="ghost" data-act="rel" data-tipo="xlsx" data-escopo="geral">Relatório geral (Excel)</button>
      <button class="ghost" data-act="rel" data-tipo="pdf" data-escopo="geral">Relatório geral (PDF)</button>
    </div>
    ${lista.length === 0 ? '<p class="muted">Nenhum equipamento ainda. Cadastre o primeiro abaixo.</p>' : ''}
    <div class="grid">${lista.map((q) => {
      const [txt, cor] = status(q, revs);
      return `<a class="item ${cor}" href="#/eq/${q.id}">
        <strong>${esc(q.nome)}</strong>
        <div><small>${esc(q.tipo)}${q.placa ? ' • ' + esc(q.placa) : ''}</small></div>
        <div class="leitura">${fmt(q.leitura_atual)} <span>${un(q)}</span></div>
        <span class="pill ${cor}">${txt}</span></a>`;
    }).join('')}</div>

    <h2 style="margin-top:32px">Cadastrar equipamento</h2>
    <form class="card f" data-form="eq">
      <label>Nome / identificação<input name="nome" required placeholder="Ex.: Retro 01"></label>
      <label>Tipo<select name="tipo">${tipos.map((t) => `<option>${t}</option>`).join('')}</select></label>
      <label>Placa / série<input name="placa"></label>
      <label>Modelo<input name="modelo"></label>
      <label>Ano<input name="ano" type="number"></label>
      <label>Medição<select name="medicao"><option value="km">Quilômetros (km)</option><option value="horas">Horímetro (h)</option></select></label>
      <label>Leitura atual<input name="leitura_atual" type="number" step="any"></label>
      <label>Revisão a cada (km ou h)<input name="intervalo_revisao" type="number" step="any"></label>
      <p class="erro full" id="erro"></p>
      <button type="submit">Salvar equipamento</button>
    </form></main>`;
}

async function viewFicha(id) {
  const [e, rv, ab] = await Promise.all([
    db.from('equipamentos').select('*').eq('id', id).single(),
    db.from('revisoes').select('*').eq('equipamento_id', id).order('data', { ascending: false }),
    db.from('abastecimentos').select('*').eq('equipamento_id', id).order('leitura', { ascending: false }),
  ]);
  if (!e.data) { location.hash = '#/painel'; return; }
  Object.assign(S, { id, eq: e.data, revs: rv.data || [], abs: ab.data || [] });
  renderFicha();
}

function renderFicha(rolar) {
  const { eq, revs, abs, r, a, editRev, editAbs } = S, u = un(eq);
  const consumo = consumoMedio(eq, abs), ult = revs[0];
  app.innerHTML = topo(`<a href="#/painel">← Equipamentos</a><strong>${esc(eq.nome)}</strong>`) + `<main>
    <div class="card kpis">
      <div><small class="muted">Leitura atual</small><b>${fmt(eq.leitura_atual)} ${u}</b></div>
      <div><small class="muted">Consumo médio</small><b>${consumo || '—'}</b></div>
      <div><small class="muted">Última revisão</small><b>${ult ? dBR(ult.data) : '—'}</b></div>
    </div>
    <p class="muted">${[eq.tipo, eq.modelo, eq.ano, eq.placa].filter(Boolean).map(esc).join(' • ')}</p>
    <div class="acoes">
      <button class="ghost" data-act="rel" data-tipo="xlsx" data-escopo="eq">Baixar Excel</button>
      <button class="ghost" data-act="rel" data-tipo="pdf" data-escopo="eq">Baixar PDF</button>
    </div>
    <p class="erro" id="erro"></p>

    <h2>Revisões</h2>
    <form id="form-rev" class="card f" data-form="rev">
      <label>Data<input name="data" type="date" required value="${esc(r.data)}"></label>
      <label>Leitura (${u})<input name="leitura" type="number" step="any" required value="${esc(r.leitura)}"></label>
      <label>Quem fez<input name="responsavel" required value="${esc(r.responsavel)}"></label>
      <label>Custo (R$)<input name="custo" type="number" step="any" value="${esc(r.custo)}"></label>
      <label class="full">O que foi feito<textarea name="descricao" required rows="2">${esc(r.descricao)}</textarea></label>
      <button type="submit">${editRev ? 'Salvar alterações' : 'Registrar revisão'}</button>
      ${editRev ? '<button type="button" class="ghost" data-act="cancel-rev">Cancelar edição</button>' : ''}
    </form>
    <div class="card scroll"><table>
      <thead><tr><th>Data</th><th>${u}</th><th>Serviço</th><th>Quem fez</th><th>Custo</th><th></th></tr></thead>
      <tbody>${revs.map((x) => `<tr>
        <td>${dBR(x.data)}</td><td>${fmt(x.leitura)}</td><td>${esc(x.descricao)}</td><td>${esc(x.responsavel)}</td><td>${x.custo ? 'R$ ' + fmt(x.custo) : '—'}</td>
        <td><div class="acoes"><button class="mini" data-act="edit-rev" data-id="${x.id}">Editar</button><button class="mini del" data-act="del-rev" data-id="${x.id}">Excluir</button></div></td></tr>`).join('')
        || '<tr><td colspan="6" class="muted">Nenhuma revisão registrada.</td></tr>'}</tbody>
    </table></div>

    <h2>Abastecimentos</h2>
    <form id="form-abs" class="card f" data-form="abs">
      <label>Data<input name="data" type="date" required value="${esc(a.data)}"></label>
      <label>Leitura (${u})<input name="leitura" type="number" step="any" required value="${esc(a.leitura)}"></label>
      <label>Litros<input name="litros" type="number" step="any" required value="${esc(a.litros)}"></label>
      <label>Valor (R$)<input name="valor" type="number" step="any" value="${esc(a.valor)}"></label>
      <button type="submit">${editAbs ? 'Salvar alterações' : 'Registrar abastecimento'}</button>
      ${editAbs ? '<button type="button" class="ghost" data-act="cancel-abs">Cancelar edição</button>' : ''}
    </form>
    <div class="card scroll"><table>
      <thead><tr><th>Data</th><th>${u}</th><th>Litros</th><th>Valor</th><th></th></tr></thead>
      <tbody>${abs.map((x) => `<tr>
        <td>${dBR(x.data)}</td><td>${fmt(x.leitura)}</td><td>${fmt(x.litros)}</td><td>${x.valor ? 'R$ ' + fmt(x.valor) : '—'}</td>
        <td><div class="acoes"><button class="mini" data-act="edit-abs" data-id="${x.id}">Editar</button><button class="mini del" data-act="del-abs" data-id="${x.id}">Excluir</button></div></td></tr>`).join('')
        || '<tr><td colspan="5" class="muted">Nenhum abastecimento registrado.</td></tr>'}</tbody>
    </table></div>
    <button class="perigo" data-act="del-eq">Excluir equipamento</button></main>`;
  if (rolar) document.getElementById(rolar)?.scrollIntoView({ behavior: 'smooth' });
}

/* ---------- dados ---------- */
async function atualizarLeitura(l) {
  if (Number(l) > Number(S.eq.leitura_atual)) await db.from('equipamentos').update({ leitura_atual: l }).eq('id', S.id);
}
// Após editar/excluir: leitura atual = maior leitura registrada
async function sincronizar() {
  const [rv, ab] = await Promise.all([
    db.from('revisoes').select('leitura').eq('equipamento_id', S.id),
    db.from('abastecimentos').select('leitura').eq('equipamento_id', S.id),
  ]);
  const todas = [...(rv.data || []), ...(ab.data || [])].map((x) => Number(x.leitura));
  if (todas.length) await db.from('equipamentos').update({ leitura_atual: Math.max(...todas) }).eq('id', S.id);
}

/* ---------- relatórios ---------- */
function montar({ equipamentos, revisoes, abastecimentos }) {
  const por = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const ordem = (a, b) => a.Equipamento.localeCompare(b.Equipamento) || b._d.localeCompare(a._d);
  const limpa = (l) => l.sort(ordem).map(({ _d, ...resto }) => resto);
  const eqs = equipamentos.map((e) => {
    const rs = revisoes.filter((r) => r.equipamento_id === e.id).map((r) => r.data).sort();
    return {
      Nome: e.nome, Tipo: e.tipo, 'Placa/Série': e.placa || '', Modelo: e.modelo || '', Ano: e.ano || '',
      Medição: un(e), 'Leitura atual': Number(e.leitura_atual), 'Revisão a cada': e.intervalo_revisao ? Number(e.intervalo_revisao) : '',
      'Última revisão': rs.length ? dBR(rs[rs.length - 1]) : '',
      'Consumo médio': consumoMedio(e, abastecimentos.filter((a) => a.equipamento_id === e.id)) || '',
    };
  }).sort((a, b) => a.Nome.localeCompare(b.Nome));
  const revs = limpa(revisoes.filter((r) => por[r.equipamento_id]).map((r) => ({
    Equipamento: por[r.equipamento_id].nome, Data: dBR(r.data), Leitura: Number(r.leitura), Unidade: un(por[r.equipamento_id]),
    Serviço: r.descricao, 'Quem fez': r.responsavel, 'Custo (R$)': r.custo ? Number(r.custo) : '', _d: r.data })));
  const abs = limpa(abastecimentos.filter((a) => por[a.equipamento_id]).map((a) => ({
    Equipamento: por[a.equipamento_id].nome, Data: dBR(a.data), Leitura: Number(a.leitura), Unidade: un(por[a.equipamento_id]),
    Litros: Number(a.litros), 'Valor (R$)': a.valor ? Number(a.valor) : '', _d: a.data })));
  return [['Equipamentos', eqs], ['Revisões', revs], ['Abastecimentos', abs]];
}

function baixarExcel(dados, arquivo) {
  const wb = XLSX.utils.book_new();
  montar(dados).forEach(([nome, linhas]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), nome));
  XLSX.writeFile(wb, arquivo + '.xlsx');
}

function baixarPDF(dados, arquivo) {
  const doc = new jspdf.jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16); doc.text('Relatório de equipamentos', 14, 16);
  doc.setFontSize(9); doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), 14, 22);
  let y = 28;
  montar(dados).forEach(([titulo, linhas]) => {
    if (!linhas.length) return;
    if (y > 170) { doc.addPage(); y = 16; }
    doc.setFontSize(12); doc.text(titulo, 14, y);
    const cols = Object.keys(linhas[0]);
    doc.autoTable({ startY: y + 3, head: [cols], body: linhas.map((l) => cols.map((c) => l[c])), styles: { fontSize: 8 }, headStyles: { fillColor: [27, 37, 48] } });
    y = doc.lastAutoTable.finalY + 10;
  });
  doc.save(arquivo + '.pdf');
}

async function relatorio(tipo, escopo) {
  let dados, nome;
  if (escopo === 'eq') {
    dados = { equipamentos: [S.eq], revisoes: S.revs, abastecimentos: S.abs };
    nome = 'relatorio-' + S.eq.nome.replace(/\s+/g, '-').toLowerCase();
  } else {
    const [e, r, a] = await Promise.all([db.from('equipamentos').select('*'), db.from('revisoes').select('*'), db.from('abastecimentos').select('*')]);
    dados = { equipamentos: e.data || [], revisoes: r.data || [], abastecimentos: a.data || [] };
    nome = 'relatorio-frota';
  }
  tipo === 'pdf' ? baixarPDF(dados, nome) : baixarExcel(dados, nome);
}

/* ---------- eventos ---------- */
app.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target, k = f.dataset.form, d = Object.fromEntries(new FormData(f));
  erro('');
  if (k === 'login') {
    const { data, error } = criar
      ? await db.auth.signUp({ email: d.email, password: d.senha })
      : await db.auth.signInWithPassword({ email: d.email, password: d.senha });
    if (error) return erro(error.message);
    if (criar && !data.session) return erro('Conta criada. Confirme o e-mail e depois entre.');
    location.hash = '#/painel'; return rota();
  }
  if (k === 'eq') {
    const { error } = await db.from('equipamentos').insert({ ...d, ano: d.ano || null, leitura_atual: d.leitura_atual || 0, intervalo_revisao: d.intervalo_revisao || null });
    if (error) return erro(error.message);
    return viewPainel();
  }
  if (k === 'rev') {
    const dados = { ...d, custo: d.custo || null };
    const { error } = S.editRev
      ? await db.from('revisoes').update(dados).eq('id', S.editRev)
      : await db.from('revisoes').insert({ ...dados, equipamento_id: S.id });
    if (error) return erro(error.message);
    S.editRev ? await sincronizar() : await atualizarLeitura(d.leitura);
    S.r = R0(); S.editRev = null; return viewFicha(S.id);
  }
  if (k === 'abs') {
    const dados = { ...d, valor: d.valor || null };
    const { error } = S.editAbs
      ? await db.from('abastecimentos').update(dados).eq('id', S.editAbs)
      : await db.from('abastecimentos').insert({ ...dados, equipamento_id: S.id });
    if (error) return erro(error.message);
    S.editAbs ? await sincronizar() : await atualizarLeitura(d.leitura);
    S.a = A0(); S.editAbs = null; return viewFicha(S.id);
  }
});

app.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'alt') { ev.preventDefault(); criar = !criar; return viewLogin(); }
  if (act === 'sair') { await db.auth.signOut(); location.hash = ''; return rota(); }
  if (act === 'rel') return relatorio(b.dataset.tipo, b.dataset.escopo);
  if (act === 'edit-rev') {
    const x = S.revs.find((v) => v.id === id);
    S.r = { data: x.data, leitura: x.leitura, descricao: x.descricao, responsavel: x.responsavel, custo: x.custo ?? '' };
    S.editRev = id; return renderFicha('form-rev');
  }
  if (act === 'edit-abs') {
    const x = S.abs.find((v) => v.id === id);
    S.a = { data: x.data, leitura: x.leitura, litros: x.litros, valor: x.valor ?? '' };
    S.editAbs = id; return renderFicha('form-abs');
  }
  if (act === 'cancel-rev') { S.editRev = null; S.r = R0(); return renderFicha(); }
  if (act === 'cancel-abs') { S.editAbs = null; S.a = A0(); return renderFicha(); }
  if (act === 'del-rev' || act === 'del-abs') {
    if (!confirm('Excluir este registro?')) return;
    const { error } = await db.from(act === 'del-rev' ? 'revisoes' : 'abastecimentos').delete().eq('id', id);
    if (error) return erro(error.message);
    await sincronizar(); return viewFicha(S.id);
  }
  if (act === 'del-eq') {
    if (!confirm('Excluir este equipamento e todo o histórico?')) return;
    await db.from('equipamentos').delete().eq('id', S.id);
    location.hash = '#/painel'; return rota();
  }
});

/* ---------- rotas ---------- */
async function rota() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return viewLogin();
  const h = location.hash.replace('#/', '');
  if (h.startsWith('eq/')) { S.r = R0(); S.a = A0(); S.editRev = S.editAbs = null; return viewFicha(h.slice(3)); }
  return viewPainel();
}
addEventListener('hashchange', rota);
rota();
