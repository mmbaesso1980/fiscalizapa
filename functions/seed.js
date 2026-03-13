const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({projectId:'fiscallizapa'});
const db = admin.firestore();
const deps = [
{nome:'Igor Normando',partido:'MDB',votos:98432,gastos:0,projetos:0},
{nome:'Dilvanda Faro',partido:'PT',votos:87654,gastos:0,projetos:0},
{nome:'Thiago Araujo',partido:'REPUBLICANOS',votos:76543,gastos:0,projetos:0},
{nome:'Fabio Freitas',partido:'PSDB',votos:65432,gastos:0,projetos:0},
{nome:'Carlos Bordalo',partido:'PT',votos:54321,gastos:0,projetos:0},
{nome:'Eraldo Pimenta',partido:'MDB',votos:48765,gastos:0,projetos:0},
{nome:'Miro Sanova',partido:'PDT',votos:43210,gastos:0,projetos:0},
{nome:'Ana Cunha',partido:'PSDB',votos:39876,gastos:0,projetos:0},
{nome:'Cilene Couto',partido:'PSOL',votos:35432,gastos:0,projetos:0}
];
Promise.all(deps.map(d => db.collection('deputados').add(d))).then(r => {console.log(r.length+' deputados adicionados');process.exit(0);}).catch(e => {console.error(e.message);process.exit(1);});
