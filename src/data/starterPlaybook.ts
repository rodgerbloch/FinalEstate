import type { EstateStage, TaskCategory, TaskPriority } from '../types/estate';

export interface PlaybookSeedTask {
  title: string;
  category: TaskCategory;
  stage: EstateStage;
  priority: TaskPriority;
  timingLabel: string;
  offsetDays: number | null;
  instructions: string[];
  executorNotes: string;
  completed?: boolean;
  prerequisiteTitles?: string[];
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const STARTER_PLAYBOOK: PlaybookSeedTask[] = [
  // 1. Assets
  {
    title: 'Compile Master Property, Account & Investment Inventory',
    category: 'Assets',
    stage: 'Pre-Need Planning',
    priority: 'High',
    timingLabel: 'Before incapacitation',
    offsetDays: 10,
    instructions: [
      'List all checking, savings, CD, brokerage, retirement (401k/IRA), and HSA accounts with institution names and last 4 digits.',
      'Record all real estate deeds, vehicle titles, and safe-deposit box locations including key custody.',
      'Note beneficiary designations and Transfer-on-Death (TOD) or Payable-on-Death (POD) elections for each account.',
      'Upload account summary statements (with full account numbers stored securely) to the Document Vault.',
    ],
    executorNotes: 'Include contact details for primary wealth advisor or CPA.',
  },
  {
    title: 'Secure Real Property, Vehicles & Valuables',
    category: 'Assets',
    stage: 'Executor Action',
    priority: 'High',
    timingLabel: 'Immediate (1–3 days)',
    offsetDays: 2,
    instructions: [
      'Confirm locks, alarm codes, and thermostat/water shutoff settings at unoccupied residences.',
      'Notify homeowner insurer of vacancy status so coverage does not lapse.',
      'Photograph high-value heirlooms, artwork, and jewelry before distributing or storing.',
      'Secure vehicles in locked garages and verify registration and insurance remain active.',
    ],
    executorNotes: '',
  },
  {
    title: 'Obtain Date-of-Death Asset Valuations & Cost Basis',
    category: 'Assets',
    stage: 'Executor Action',
    priority: 'Medium',
    timingLabel: 'Within 60 days',
    offsetDays: 45,
    instructions: [
      'Request formal date-of-death balance and accrued interest letters from every bank and brokerage.',
      'Order a licensed residential appraisal for real property to establish stepped-up tax basis.',
      'Document fair market value of vehicles and business interests as of the date of death.',
    ],
    executorNotes: '',
  },

  // 2. Liabilities
  {
    title: 'Document Mortgages, Loans, Credit Cards & Recurring Debts',
    category: 'Liabilities',
    stage: 'Pre-Need Planning',
    priority: 'High',
    timingLabel: 'Before incapacitation',
    offsetDays: 14,
    instructions: [
      'List mortgage servicers, HELOCs, auto loans, student loans, and personal lines of credit.',
      'Record active credit cards, joint vs. individual account status, and auto-pay bank links.',
      'Note any personal guarantees, promissory notes owed to or by family members, and tax installment plans.',
    ],
    executorNotes: '',
  },
  {
    title: 'Publish Creditor Notice & Review Formal Claims',
    category: 'Liabilities',
    stage: 'Executor Action',
    priority: 'High',
    timingLabel: 'Within 30 days',
    offsetDays: 24,
    instructions: [
      'Consult probate counsel on statutory creditor notice publication requirements in the decedent’s county.',
      'Audit incoming medical bills against explanation-of-benefits statements before paying from estate funds.',
      'Do not pay unsecured debts from personal funds or distribute assets before the creditor claim window closes.',
    ],
    executorNotes: '',
  },
  {
    title: 'Close Individual Credit Cards & Freeze Credit Bureaus',
    category: 'Liabilities',
    stage: 'Executor Action',
    priority: 'Medium',
    timingLabel: 'Within 14 days',
    offsetDays: 9,
    instructions: [
      'Send certified death certificate copies to Equifax, Experian, and TransUnion requesting a deceased alert/freeze.',
      'Notify individual credit card issuers to close accounts and halt recurring charges.',
      'Verify whether any surviving spouse relies on a card as an authorized user before closing joint facilities.',
    ],
    executorNotes: '',
  },

  // 3. Cashflow
  {
    title: 'Establish Emergency Liquidity & Autopay Map',
    category: 'Cashflow',
    stage: 'Pre-Need Planning',
    priority: 'High',
    timingLabel: 'Before incapacitation',
    offsetDays: -2,
    instructions: [
      'Identify which bank account pays utilities, property taxes, HOA dues, and insurance premiums.',
      'Ensure at least 3–6 months of household carrying costs remain accessible in a POD or joint checking account.',
      'List all recurring subscriptions, memberships, and charitable pledges that should be paused promptly.',
    ],
    executorNotes: 'Check municipal property tax due dates in April and October.',
  },
  {
    title: 'Apply for Estate EIN & Open Dedicated Estate Checking Account',
    category: 'Cashflow',
    stage: 'Executor Action',
    priority: 'High',
    timingLabel: 'Within 14 days',
    offsetDays: 7,
    instructions: [
      'Once Letters Testamentary or Administration are issued, apply online for an IRS Employer Identification Number (EIN) for the estate.',
      'Open an estate checking account using the EIN and Letters Testamentary—never commingle personal funds.',
      'Transfer estate cash balances into the estate account and route all estate bills and income through it.',
    ],
    executorNotes: '',
    prerequisiteTitles: ['File Will & Petition for Letters Testamentary with Probate Court'],
  },
  {
    title: 'Reconcile Final Utility, Lease & Subscription Accounts',
    category: 'Cashflow',
    stage: 'Executor Action',
    priority: 'Low',
    timingLabel: 'Within 30 days',
    offsetDays: 28,
    instructions: [
      'Transfer essential utilities (electric, gas, water, security monitoring) into the estate’s name until property transfer.',
      'Cancel non-essential streaming, club, phone, and software subscriptions.',
      'Request pro-rated refunds for prepaid annual memberships or insurance policies.',
    ],
    executorNotes: '',
  },

  // 4. Legal & Probate
  {
    title: 'Verify Signed Will, Revocable Trust, POA & Healthcare Directive',
    category: 'Legal & Probate',
    stage: 'Pre-Need Planning',
    priority: 'High',
    timingLabel: 'Review annually',
    offsetDays: 5,
    instructions: [
      'Confirm originals of the Last Will and Testament, Trust Agreement, Durable Power of Attorney, and Advance Healthcare Directive are signed, witnessed, and notarized.',
      'Record the exact physical storage location of originals (e.g., attorney vault or fireproof home safe) and who holds access.',
      'Store clear scanned PDF copies in the Estate Ledger Document Vault linked to this task.',
    ],
    executorNotes: 'Verify witness signatures match current state statutes.',
    completed: true,
  },
  {
    title: 'Order Certified Death Certificates (10–15 Copies)',
    category: 'Legal & Probate',
    stage: 'Executor Action',
    priority: 'High',
    timingLabel: 'Immediate (1–3 days)',
    offsetDays: 3,
    instructions: [
      'Order 10–15 certified copies through the funeral director or county vital records office.',
      'Keep a log of every institution that requires an original raised-seal copy versus a scanned PDF.',
      'Store surplus certified copies in a secure folder for probate court and title transfers.',
    ],
    executorNotes: '',
  },
  {
    title: 'File Will & Petition for Letters Testamentary with Probate Court',
    category: 'Legal & Probate',
    stage: 'Executor Action',
    priority: 'High',
    timingLabel: 'Within 14 days',
    offsetDays: 12,
    instructions: [
      'Locate the original signed Will (courts typically require the physical wet-ink original).',
      'Schedule an initial briefing with the estate probate attorney using the Estate Ledger Legal Meeting Report.',
      'File the probate petition and obtain certified Letters Testamentary / Letters of Administration.',
    ],
    executorNotes: '',
    prerequisiteTitles: [
      'Verify Signed Will, Revocable Trust, POA & Healthcare Directive',
      'Order Certified Death Certificates (10–15 Copies)',
    ],
  },

  // 5. Insurance
  {
    title: 'Centralize Life, Long-Term Care, Homeowners & Auto Policies',
    category: 'Insurance',
    stage: 'Pre-Need Planning',
    priority: 'Medium',
    timingLabel: 'Before incapacitation',
    offsetDays: 20,
    instructions: [
      'Record carrier names, policy numbers, coverage limits, and agent phone numbers for every active policy.',
      'Verify primary and contingent beneficiaries on all life insurance and employer group policies.',
      'Upload policy declaration pages to the Document Vault under Insurance.',
    ],
    executorNotes: '',
  },
  {
    title: 'Submit Life Insurance & Annuity Death Benefit Claims',
    category: 'Insurance',
    stage: 'Executor Action',
    priority: 'High',
    timingLabel: 'Within 14 days',
    offsetDays: 11,
    instructions: [
      'Contact each life insurer’s claims department and check employer HR for supplemental group life coverage.',
      'Provide certified death certificate, claim forms, and beneficiary identification.',
      'Confirm whether proceeds pass directly to named beneficiaries outside of probate.',
    ],
    executorNotes: '',
    prerequisiteTitles: ['Order Certified Death Certificates (10–15 Copies)'],
  },
  {
    title: 'Notify Health Insurer, Medicare & Employer Benefits',
    category: 'Insurance',
    stage: 'Executor Action',
    priority: 'Medium',
    timingLabel: 'Within 30 days',
    offsetDays: 22,
    instructions: [
      'Report death to Social Security Administration (if not already handled by funeral home) and Medicare.',
      'Contact former employer benefits desk regarding COBRA continuation for dependents or pension survivor elections.',
      'Hold final medical claims open until all Explanation of Benefits statements settle.',
    ],
    executorNotes: '',
  },

  // 6. Digital & Access
  {
    title: 'Prepare Password Manager Legacy Contact & Two-Factor Recovery',
    category: 'Digital & Access',
    stage: 'Pre-Need Planning',
    priority: 'High',
    timingLabel: 'Before incapacitation',
    offsetDays: 6,
    instructions: [
      'Designate an Emergency / Legacy Contact in Apple ID, Google Inactive Account Manager, and your password manager.',
      'Document device passcodes and hardware security key locations in an offline sealed envelope referenced here (never paste raw passwords in plain text).',
      'List domain names, cloud photo libraries, and business software subscriptions.',
    ],
    executorNotes: '',
  },
  {
    title: 'Preserve Primary Email, Phone Number & Cloud Photos',
    category: 'Digital & Access',
    stage: 'Executor Action',
    priority: 'Medium',
    timingLabel: 'Within 14 days',
    offsetDays: 13,
    instructions: [
      'Do NOT cancel the decedent’s mobile phone line immediately—two-factor SMS codes are critical for account recovery.',
      'Download family photo archives and tax records from cloud drives before closing accounts.',
      'Monitor primary email inbox for incoming electronic statements, annual tax 1099s, and renewal notices.',
    ],
    executorNotes: '',
  },
  {
    title: 'Memorialize or Close Social Media & Online Profiles',
    category: 'Digital & Access',
    stage: 'Executor Action',
    priority: 'Low',
    timingLabel: 'Within 60 days',
    offsetDays: 50,
    instructions: [
      'Follow platform legacy workflows (LinkedIn, Facebook, Instagram, X) using death certificate and proof of executor authority.',
      'Decide with family members whether accounts should be memorialized or permanently deleted.',
    ],
    executorNotes: '',
  },

  // 7. Final Wishes
  {
    title: 'Record Funeral, Burial/Cremation & Memorial Preferences',
    category: 'Final Wishes',
    stage: 'Pre-Need Planning',
    priority: 'Medium',
    timingLabel: 'Before incapacitation',
    offsetDays: 25,
    instructions: [
      'Document burial, cremation, or anatomical donation preferences and any prepaid funeral home contracts or cemetery deeds.',
      'Share preferred readings, music, clergy or celebrant contacts, and obituary notes.',
      'Note pet care guardians and immediate feeding/veterinary instructions.',
    ],
    executorNotes: '',
  },
  {
    title: 'Coordinate Immediate Family Notifications & Service Arrangements',
    category: 'Final Wishes',
    stage: 'Executor Action',
    priority: 'High',
    timingLabel: 'Immediate (1–3 days)',
    offsetDays: 1,
    instructions: [
      'Review recorded Final Wishes and any prepaid funeral contracts before signing new service agreements.',
      'Arrange immediate care for pets, dependents, and houseplants.',
      'Coordinate travel and service timing with immediate family and faith or community leaders.',
    ],
    executorNotes: '',
  },
  {
    title: 'Distribute Personal Property Memoranda & Sentimental Heirlooms',
    category: 'Final Wishes',
    stage: 'Executor Action',
    priority: 'Low',
    timingLabel: 'Within 60 days',
    offsetDays: 55,
    instructions: [
      'Consult any signed Personal Property Memorandum referenced in the Will.',
      'Invite family members to review heirlooms fairly and log signed receipt acknowledgments for valuable items.',
      'Arrange charitable donation receipts for remaining household goods.',
    ],
    executorNotes: '',
    prerequisiteTitles: ['Publish Creditor Notice & Review Formal Claims'],
  },
];

export function buildSeedTaskDueDate(offsetDays: number | null): string {
  if (offsetDays === null) return '';
  return addDaysIso(offsetDays);
}
