import { initializeSchema, get } from './index';
import { ensureDefaultSettings } from './settings';
import { run } from './index';
import { logger } from '../logger';

const USERS = [
  { name: 'Tendulkar', email: 'admin.tendulkar@smartsolutionagency.in', phone: '7094523321', role: 'super_admin', branch: 'Coimbatore' },
  { name: 'Siddharthan A', email: 'smartsolution.agency01@gmail.com', phone: '8248011190', role: 'super_admin', branch: 'Coimbatore' },
  { name: 'Rajesh (GM)', email: 'gmrk@smartsolutionagency.in', phone: '9000000000', role: 'admin', branch: 'Coimbatore' },
  { name: 'HR & Admin', email: 'hr@smartsolutionagency.in', phone: '7550173452', role: 'hr', branch: 'Coimbatore' },
  { name: 'Prathima', email: 'prathimatadmoreacademy@gmail.com', phone: '9632215972', role: 'sales', branch: 'Coimbatore' },
  { name: 'Hari', email: 'harhar9972@gmail.com', phone: '6383331947', role: 'sales', branch: 'Coimbatore' },
  { name: 'Kishore M', email: 'krishoffcl12@gmail.com', phone: '9952297655', role: 'sales', branch: 'Coimbatore' },
  { name: 'Service Support', email: 'service@smartsolutionagency.in', phone: '9000000007', role: 'service', branch: 'Coimbatore' },
];

const FIRST_NAMES = [
  'Suresh', 'Anitha', 'Vignesh', 'Kavitha', 'Ramesh', 'Swathi', 'Praveen', 'Nandhini', 'Gokul', 'Sangeetha',
  'Ajith', 'Deepika', 'Sathish', 'Revathi', 'Manoj', 'Harini', 'Karthik', 'Lavanya', 'Vinoth', 'Pavithra',
  'Selvam', 'Bhuvana', 'Ashok', 'Kokila', 'Siva', 'Priyadharshini', 'Balaji', 'Sujatha', 'Kumar', 'Anjali',
  'Ravi', 'Geetha', 'Murali', 'Kirthika', 'Santhosh', 'Madhumathi', 'Ragul', 'Aishwarya', 'Dinesh', 'Shalini',
  'Ganesh', 'Roshini', 'Prakash', 'Vidhya', 'Ilango', 'Tamilarasi', 'Jagan', 'Pooja', 'Naveen', 'Keerthana',
  'Sridhar', 'Ranjani', 'Bharath', 'Mythili', 'Thirumal', 'Anushya', 'Yuvaraj', 'Varshini', 'Sakthi', 'Divya',
  'Hari', 'Monisha', 'Venkat', 'Subha', 'Kishore', 'Sowmiya', 'Logesh', 'Banupriya', 'Arvind', 'Sneha',
  'Muthu', 'Kalai', 'Naresh', 'Rithika', 'Pandian', 'Gayathri', 'Vimal', 'Aarthi', 'Sekar', 'Indhu',
];

const LAST_NAMES = ['Kumar', 'Rajan', 'Mani', 'Selvan', 'Pandian', 'Moorthy', 'Sundaram', 'Velu', 'Gopal', 'Anand', 'Krishnan', 'Shankar', 'Murugan', 'Babu', 'Chandran'];

const SOURCES = ['Meta Ads', 'Google Ads', 'Purchased Data', 'Referral', 'Walk-in', 'Website'];
const SERVICES = ['ATS Resume', 'Job Support', 'Support Call', 'Website Making'];

function random<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone(): string {
  const prefixes = ['98', '97', '96', '95', '91', '90', '80', '74', '73', '70'];
  let num = random(prefixes);
  for (let i = 0; i < 8; i += 1) num += String(Math.floor(Math.random() * 10));
  return num;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

initializeSchema();
ensureDefaultSettings();

const userCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM users')?.c ?? 0;
if (userCount > 0) {
  logger.info(`Seed skipped: ${userCount} user(s) already exist.`);
  process.exit(0);
}

for (const user of USERS) {
  run('INSERT INTO users (name, email, phone, role, branch) VALUES (?, ?, ?, ?, ?)', [
    user.name, user.email, user.phone, user.role, user.branch,
  ]);
}
logger.info(`Seeded ${USERS.length} users`);

const salesReps = [3, 4, 5, 6];
const salesBranch: Record<number, string> = { 3: 'Coimbatore', 4: 'Coimbatore', 5: 'Bangalore', 6: 'Bangalore' };

let seed = 0;
for (let i = 0; i < 60; i += 1) {
  const name = `${random(FIRST_NAMES)} ${random(LAST_NAMES)}`;
  const phone = randomPhone();
  const source = random(SOURCES);
  const service = random(SERVICES);
  const rep = random(salesReps);

  let status = 'New';
  let followUpAt: string | null = null;
  let lastOutcome: string | null = null;
  let assignedTo: number | null = rep;

  const roll = Math.random();
  if (roll < 0.2) {
    status = 'Attempting';
    lastOutcome = 'Not Answered';
  } else if (roll < 0.4) {
    status = 'Follow-up';
    lastOutcome = 'Call Back Later';
    followUpAt = roll < 0.35 ? hoursFromNow(2 + Math.random() * 24) : daysAgoIso(1 + Math.floor(Math.random() * 3));
  } else if (roll < 0.45) {
    status = 'Not Interested';
    lastOutcome = 'Not Interested';
  } else if (roll < 0.52) {
    status = 'Converted';
    lastOutcome = 'Converted';
  }

  const assignedAt = daysAgoIso(Math.floor(Math.random() * 10));
  const createdAt = assignedAt;
  const leadId = run(
    `INSERT INTO leads (external_key, name, phone, email, whatsapp, source, service, branch,
       status, assigned_to, assigned_at, follow_up_at, last_call_at, last_outcome, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `seed-${i}`,
      name,
      phone,
      `${name.toLowerCase().replace(/[^a-z]/g, '.')}${seed}@gmail.com`,
      phone,
      source,
      service,
      salesBranch[rep],
      status,
      assignedTo,
      assignedAt,
      followUpAt,
      status === 'New' ? null : daysAgoIso(Math.floor(Math.random() * 5)),
      lastOutcome,
      createdAt,
      createdAt,
    ],
  ).lastInsertRowid;
  seed += 1;

  if (status !== 'New') {
    run('INSERT INTO call_logs (lead_id, user_id, outcome, duration_sec, note, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      leadId,
      rep,
      lastOutcome ?? 'Connected',
      Math.floor(30 + Math.random() * 300),
      ['Asked about resume format', 'Interested in ATS package', 'Wants to call back after office hours', 'Asked pricing', 'Quiet, checking with family'][Math.floor(Math.random() * 5)],
      daysAgoIso(Math.floor(Math.random() * 6)),
    ]);
  }

  if (status === 'Converted') {
    const amount = [999, 1499, 2499, 3999, 5999][Math.floor(Math.random() * 5)];
    const paid = Math.random() < 0.7;
    const clientId = run(
      `INSERT INTO clients (lead_id, name, phone, email, whatsapp, service, package_plan, amount,
         payment_status, source, sales_person_id, status, due_date, guarantee_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leadId,
        name,
        phone,
        `${name.toLowerCase().replace(/[^a-z]/g, '.')}${seed}@gmail.com`,
        phone,
        service,
        service === 'ATS Resume' ? 'ATS Resume - Standard' : service === 'Job Support' ? 'Job Support - 3 Months' : 'Basic',
        amount,
        paid ? 'Paid' : 'Pending',
        source,
        rep,
        paid ? (Math.random() < 0.4 ? 'Delivered' : 'In Progress') : 'In Progress',
        hoursFromNow(24 + Math.random() * 24),
        Math.random() < 0.8 ? 'Guarantee Active' : 'Guarantee Fulfilled',
        createdAt,
        createdAt,
      ],
    ).lastInsertRowid;

    if (paid) {
      run(
        `INSERT INTO payments (client_id, amount, method, gateway_ref, status, created_at)
         VALUES (?, ?, 'Gateway', ?, 'Confirmed', ?)`,
        [clientId, amount, `pay_${leadId}${Math.floor(Math.random() * 9999)}`, daysAgoIso(Math.floor(Math.random() * 4))],
      );
    }
  }
}

run(
  `INSERT INTO lead_batches (file_name, source, status, total, imported, duplicates, errors)
   VALUES ('seed-demo-leads.csv', 'Seed', 'Imported', 60, 60, 0, 0)`,
);

logger.info('Seed complete: 9 users, 60 leads, demo conversions');
