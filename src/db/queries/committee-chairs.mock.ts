// MOCK committee chair/vice-chair data. Covers the committee codes present on the
// Jaden Kapali org's bills so every card lines up. Replaced by real
// committees → committee_chairs → legislators joins when those tables land.
export interface MockChairEntry {
  chamber: 'House' | 'Senate';
  chair: { name: string; email: string; phone: string };
  viceChair: { name: string; email: string; phone: string };
}

export const MOCK_CHAIRS: Record<string, MockChairEntry> = {
  // ---- House ----
  AGR: {
    chamber: 'House',
    chair: { name: 'Rep. Kirstin Kahaloa', email: 'repkahaloa@capitol.hawaii.gov', phone: '808-586-8510' },
    viceChair: { name: 'Rep. Cory Chun', email: 'repchun@capitol.hawaii.gov', phone: '808-586-8520' },
  },
  PBS: {
    chamber: 'House',
    chair: { name: 'Rep. Della Au Belatti', email: 'repbelatti@capitol.hawaii.gov', phone: '808-586-9425' },
    viceChair: { name: 'Rep. Rachele Lamosao', email: 'replamosao@capitol.hawaii.gov', phone: '808-586-6440' },
  },
  CAA: {
    chamber: 'House',
    chair: { name: 'Rep. Adrian Tam', email: 'reptam@capitol.hawaii.gov', phone: '808-586-9425' },
    viceChair: { name: 'Rep. Jenna Takenouchi', email: 'reptakenouchi@capitol.hawaii.gov', phone: '808-586-6200' },
  },
  CPC: {
    chamber: 'House',
    chair: { name: 'Rep. Mark Nakashima', email: 'repnakashima@capitol.hawaii.gov', phone: '808-586-6680' },
    viceChair: { name: 'Rep. Jackson Sayama', email: 'repsayama@capitol.hawaii.gov', phone: '808-586-6900' },
  },
  FIN: {
    chamber: 'House',
    chair: { name: 'Rep. Kyle Yamashita', email: 'repyamashita@capitol.hawaii.gov', phone: '808-586-6200' },
    viceChair: { name: 'Rep. Jenna Takenouchi', email: 'reptakenouchi2@capitol.hawaii.gov', phone: '808-586-6210' },
  },
  WAL: {
    chamber: 'House',
    chair: { name: 'Rep. Elle Cochran', email: 'repcochran@capitol.hawaii.gov', phone: '808-586-6100' },
    viceChair: { name: 'Rep. Mahina Poepoe', email: 'reppoepoe@capitol.hawaii.gov', phone: '808-586-6790' },
  },
  EEP: {
    chamber: 'House',
    chair: { name: 'Rep. Nicole Lowen', email: 'replowen@capitol.hawaii.gov', phone: '808-586-8400' },
    viceChair: { name: 'Rep. Cory Chun', email: 'repchun2@capitol.hawaii.gov', phone: '808-586-8410' },
  },
  HLT: {
    chamber: 'House',
    chair: { name: 'Rep. Gregg Takayama', email: 'reptakayama@capitol.hawaii.gov', phone: '808-586-6340' },
    viceChair: { name: 'Rep. Jenna Takenouchi', email: 'reptakenouchi3@capitol.hawaii.gov', phone: '808-586-6350' },
  },
  EDN: {
    chamber: 'House',
    chair: { name: 'Rep. Justin Woodson', email: 'repwoodson@capitol.hawaii.gov', phone: '808-586-6210' },
    viceChair: { name: 'Rep. Trish La Chica', email: 'replachica@capitol.hawaii.gov', phone: '808-586-9470' },
  },
  // ---- Senate ----
  AEN: {
    chamber: 'Senate',
    chair: { name: 'Sen. Mike Gabbard', email: 'sengabbard@capitol.hawaii.gov', phone: '808-586-6830' },
    viceChair: { name: 'Sen. Herbert Richards', email: 'senrichards@capitol.hawaii.gov', phone: '808-586-7335' },
  },
  WAM: {
    chamber: 'Senate',
    chair: { name: 'Sen. Donovan Dela Cruz', email: 'sendelacruz@capitol.hawaii.gov', phone: '808-586-6090' },
    viceChair: { name: 'Sen. Sharon Moriwaki', email: 'senmoriwaki@capitol.hawaii.gov', phone: '808-586-6740' },
  },
  CPN: {
    chamber: 'Senate',
    chair: { name: 'Sen. Jarrett Keohokalole', email: 'senkeohokalole@capitol.hawaii.gov', phone: '808-586-6730' },
    viceChair: { name: 'Sen. Carol Fukunaga', email: 'senfukunaga@capitol.hawaii.gov', phone: '808-586-6890' },
  },
  EDU: {
    chamber: 'Senate',
    chair: { name: 'Sen. Michelle Kidani', email: 'senkidani@capitol.hawaii.gov', phone: '808-586-7100' },
    viceChair: { name: 'Sen. Samantha DeCorte', email: 'sendecorte@capitol.hawaii.gov', phone: '808-586-7793' },
  },
  HHS: {
    chamber: 'Senate',
    chair: { name: 'Sen. Joy San Buenaventura', email: 'sensanbuenaventura@capitol.hawaii.gov', phone: '808-586-9385' },
    viceChair: { name: 'Sen. Henry Aquino', email: 'senaquino@capitol.hawaii.gov', phone: '808-586-6180' },
  },
  TCA: {
    chamber: 'Senate',
    chair: { name: 'Sen. Chris Lee', email: 'senlee@capitol.hawaii.gov', phone: '808-586-6270' },
    viceChair: { name: 'Sen. Lynn DeCoite', email: 'sendecoite@capitol.hawaii.gov', phone: '808-586-7345' },
  },
  JDC: {
    chamber: 'Senate',
    chair: { name: 'Sen. Karl Rhoads', email: 'senrhoads@capitol.hawaii.gov', phone: '808-586-6130' },
    viceChair: { name: 'Sen. Mike Gabbard', email: 'sengabbard2@capitol.hawaii.gov', phone: '808-586-6140' },
  },
  ECD: {
    chamber: 'Senate',
    chair: { name: 'Sen. Lynn DeCoite', email: 'sendecoite2@capitol.hawaii.gov', phone: '808-586-7345' },
    viceChair: { name: 'Sen. Brandon Elefante', email: 'senelefante@capitol.hawaii.gov', phone: '808-586-6160' },
  },
  JHA: {
    chamber: 'Senate',
    chair: { name: 'Sen. Karl Rhoads', email: 'senrhoads2@capitol.hawaii.gov', phone: '808-586-6130' },
    viceChair: { name: 'Sen. Brandon Elefante', email: 'senelefante2@capitol.hawaii.gov', phone: '808-586-6160' },
  },
};
