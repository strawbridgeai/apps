export interface Election {
  id: string;
  state: string;
  stateCode: string;
  date: string;
  type: "Primary" | "General" | "Special" | "Runoff" | "Municipal" | "Primary Runoff";
  offices: string[];
  notes?: string;
  registrationDeadline?: string;
  earlyVotingStart?: string;
}

const states = [
  { name: "Alabama", code: "AL" },
  { name: "Alaska", code: "AK" },
  { name: "Arizona", code: "AZ" },
  { name: "Arkansas", code: "AR" },
  { name: "California", code: "CA" },
  { name: "Colorado", code: "CO" },
  { name: "Connecticut", code: "CT" },
  { name: "Delaware", code: "DE" },
  { name: "Florida", code: "FL" },
  { name: "Georgia", code: "GA" },
  { name: "Hawaii", code: "HI" },
  { name: "Idaho", code: "ID" },
  { name: "Illinois", code: "IL" },
  { name: "Indiana", code: "IN" },
  { name: "Iowa", code: "IA" },
  { name: "Kansas", code: "KS" },
  { name: "Kentucky", code: "KY" },
  { name: "Louisiana", code: "LA" },
  { name: "Maine", code: "ME" },
  { name: "Maryland", code: "MD" },
  { name: "Massachusetts", code: "MA" },
  { name: "Michigan", code: "MI" },
  { name: "Minnesota", code: "MN" },
  { name: "Mississippi", code: "MS" },
  { name: "Missouri", code: "MO" },
  { name: "Montana", code: "MT" },
  { name: "Nebraska", code: "NE" },
  { name: "Nevada", code: "NV" },
  { name: "New Hampshire", code: "NH" },
  { name: "New Jersey", code: "NJ" },
  { name: "New Mexico", code: "NM" },
  { name: "New York", code: "NY" },
  { name: "North Carolina", code: "NC" },
  { name: "North Dakota", code: "ND" },
  { name: "Ohio", code: "OH" },
  { name: "Oklahoma", code: "OK" },
  { name: "Oregon", code: "OR" },
  { name: "Pennsylvania", code: "PA" },
  { name: "Rhode Island", code: "RI" },
  { name: "South Carolina", code: "SC" },
  { name: "South Dakota", code: "SD" },
  { name: "Tennessee", code: "TN" },
  { name: "Texas", code: "TX" },
  { name: "Utah", code: "UT" },
  { name: "Vermont", code: "VT" },
  { name: "Virginia", code: "VA" },
  { name: "Washington", code: "WA" },
  { name: "West Virginia", code: "WV" },
  { name: "Wisconsin", code: "WI" },
  { name: "Wyoming", code: "WY" }
];

const governorStates = ["AL", "AK", "AZ", "CA", "CO", "CT", "FL", "GA", "HI", "IL", "IA", "KS", "ME", "MD", "MA", "MI", "MN", "MO", "MT", "NV", "NH", "NM", "NY", "OK", "RI", "SC", "SD", "TN", "UT", "VT", "WA", "WI", "WY"];
const senateStates = ["AK", "AL", "AZ", "CA", "CO", "CT", "FL", "GA", "HI", "IA", "IL", "KS", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "ND", "NH", "NJ", "NM", "NY", "OK", "RI", "SC", "SD", "TN", "UT", "VA", "VT", "WA", "WI", "WY"];

function generateGenerals(): Election[] {
  return states.map((s) => {
    const offices = ["US House"];
    if (governorStates.includes(s.code)) offices.push("Governor");
    if (senateStates.includes(s.code)) offices.push(s.code === "VA" ? "US Senate (special)" : "US Senate");
    offices.push("State Legislature");

    return {
      id: `gen-2026-${s.code}`,
      state: s.name,
      stateCode: s.code,
      date: "2026-11-03",
      type: "General",
      offices
    };
  });
}

export const elections: Election[] = [
  // June
  { id: "pri-2026-al", state: "Alabama", stateCode: "AL", date: "2026-06-02", type: "Primary", offices: ["Governor", "US Senate", "US House", "State Legislature"] },
  { id: "pri-2026-ca", state: "California", stateCode: "CA", date: "2026-06-02", type: "Primary", offices: ["US Senate", "US House", "State Legislature", "Governor"] },
  { id: "pri-2026-ia", state: "Iowa", stateCode: "IA", date: "2026-06-02", type: "Primary", offices: ["US Senate (special)", "US House", "State Legislature"] },
  { id: "pri-2026-ms", state: "Mississippi", stateCode: "MS", date: "2026-06-02", type: "Primary", offices: ["US House", "State Legislature"] },
  { id: "pri-2026-mt", state: "Montana", stateCode: "MT", date: "2026-06-02", type: "Primary", offices: ["US Senate", "US House", "Governor"] },
  { id: "pri-2026-nj", state: "New Jersey", stateCode: "NJ", date: "2026-06-02", type: "Primary", offices: ["Governor", "US Senate", "US House", "State Legislature"] },
  { id: "pri-2026-nm", state: "New Mexico", stateCode: "NM", date: "2026-06-02", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-sd", state: "South Dakota", stateCode: "SD", date: "2026-06-02", type: "Primary", offices: ["US Senate", "US House", "Governor"] },
  { id: "pri-2026-il", state: "Illinois", stateCode: "IL", date: "2026-06-02", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-me", state: "Maine", stateCode: "ME", date: "2026-06-09", type: "Primary", offices: ["US Senate", "Governor", "US House"] },
  { id: "pri-2026-sc", state: "South Carolina", stateCode: "SC", date: "2026-06-09", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-nv", state: "Nevada", stateCode: "NV", date: "2026-06-09", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-nd", state: "North Dakota", stateCode: "ND", date: "2026-06-09", type: "Primary", offices: ["US Senate", "US House", "Governor"] },
  { id: "pri-2026-va", state: "Virginia", stateCode: "VA", date: "2026-06-16", type: "Primary", offices: ["US House", "State Legislature"] },
  { id: "pri-2026-ok", state: "Oklahoma", stateCode: "OK", date: "2026-06-16", type: "Primary", offices: ["US House", "Governor", "State Legislature"] },
  { id: "pri-2026-co", state: "Colorado", stateCode: "CO", date: "2026-06-23", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-ut", state: "Utah", stateCode: "UT", date: "2026-06-23", type: "Primary", offices: ["US Senate", "US House", "Governor"] },
  { id: "pri-2026-ny", state: "New York", stateCode: "NY", date: "2026-06-23", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },

  // July
  { id: "pri-2026-ga-runoff", state: "Georgia", stateCode: "GA", date: "2026-07-21", type: "Primary Runoff", offices: ["Various offices"] },
  { id: "pri-2026-md", state: "Maryland", stateCode: "MD", date: "2026-07-21", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },

  // August
  { id: "pri-2026-mi", state: "Michigan", stateCode: "MI", date: "2026-08-04", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-mo", state: "Missouri", stateCode: "MO", date: "2026-08-04", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-ks", state: "Kansas", stateCode: "KS", date: "2026-08-04", type: "Primary", offices: ["US Senate", "US House", "Governor"] },
  { id: "pri-2026-wa", state: "Washington", stateCode: "WA", date: "2026-08-04", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-tn", state: "Tennessee", stateCode: "TN", date: "2026-08-06", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-hi", state: "Hawaii", stateCode: "HI", date: "2026-08-08", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-mn", state: "Minnesota", stateCode: "MN", date: "2026-08-11", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-wi", state: "Wisconsin", stateCode: "WI", date: "2026-08-11", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-ct", state: "Connecticut", stateCode: "CT", date: "2026-08-11", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-vt", state: "Vermont", stateCode: "VT", date: "2026-08-11", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-fl", state: "Florida", stateCode: "FL", date: "2026-08-18", type: "Primary", offices: ["US Senate", "US House", "State Legislature"] },
  { id: "pri-2026-ak", state: "Alaska", stateCode: "AK", date: "2026-08-18", type: "Primary", offices: ["US Senate", "US House", "Governor"] },
  { id: "pri-2026-wy", state: "Wyoming", stateCode: "WY", date: "2026-08-18", type: "Primary", offices: ["US Senate", "US House", "Governor"] },
  { id: "pri-2026-az", state: "Arizona", stateCode: "AZ", date: "2026-08-25", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },

  // September
  { id: "pri-2026-ri", state: "Rhode Island", stateCode: "RI", date: "2026-09-08", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-nh", state: "New Hampshire", stateCode: "NH", date: "2026-09-08", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-de", state: "Delaware", stateCode: "DE", date: "2026-09-10", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },
  { id: "pri-2026-ma", state: "Massachusetts", stateCode: "MA", date: "2026-09-15", type: "Primary", offices: ["US Senate", "US House", "Governor", "State Legislature"] },

  // October
  { id: "pri-2026-la", state: "Louisiana", stateCode: "LA", date: "2026-10-24", type: "Primary", offices: ["US Senate", "US House", "State Legislature"] },

  ...generateGenerals()
].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
