import { applyRules } from "./rules";
import {
  GYM_CONTRACT_DOCUMENT,
  PARKING_TICKET_DOCUMENT,
  SAMPLE_DOCUMENT,
} from "./sample";
import type { VerifiedFinding } from "./rules";

export interface DemoExplainResult {
  document_type: string;
  jurisdiction: string;
  risk_score: number;
  summary: string;
  key_terms: { term: string; explanation: string }[];
  deadlines: { date_or_timeframe: string; what_happens: string }[];
  red_flags: {
    clause: string;
    why: string;
    source_quote: string;
    verified: boolean;
  }[];
  next_steps: string[];
  verified_findings: VerifiedFinding[];
}

export function buildDemoResult(): DemoExplainResult {
  return {
    document_type: "Lease Agreement",
    jurisdiction: "California",
    risk_score: 8,
    summary:
      "This residential lease contains several clauses that heavily favor the landlord — including a 90-day deposit return window, a deposit equal to two months' rent, entry without notice, and a mandatory non-refundable monthly fee the landlord can raise at any time.",
    key_terms: [
      {
        term: "Resident Benefit & Amenity Fee",
        explanation:
          "An extra monthly charge on top of rent, described as non-refundable and adjustable by the landlord.",
      },
      {
        term: "Liquidated damages (late fee)",
        explanation:
          "A preset penalty (here, 15% of rent) charged for late payment rather than the landlord's actual costs.",
      },
    ],
    deadlines: [
      {
        date_or_timeframe: "75 days before lease end",
        what_happens:
          "Tenant must give written notice if not renewing; missing this deadline auto-renews the lease for 12 months at a 10% rent increase.",
      },
    ],
    red_flags: [
      {
        clause: "90-day security deposit return",
        why: "California generally requires return within 21 days, not 90.",
        source_quote:
          "Landlord shall return the deposit, less lawful deductions, within ninety (90) days after Tenant vacates.",
        verified: true,
      },
      {
        clause: "Entry without prior notice",
        why: "Landlord can enter at any time without warning, which may violate California notice requirements.",
        source_quote:
          "reserves the right to enter the Premises at any time, without prior notice, for inspection",
        verified: true,
      },
      {
        clause: "15% late fee",
        why: "A flat 15% penalty may be an unenforceable liquidated damages clause.",
        source_quote:
          "Late rent received after the 3rd of the month shall incur a late charge equal to fifteen percent (15%) of the monthly rent.",
        verified: true,
      },
    ],
    next_steps: [
      "Ask the landlord to align the deposit return period with California's 21-day rule.",
      "Negotiate or remove the non-refundable amenity fee before signing.",
      "Request a written entry-notice clause consistent with Cal. Civ. Code §1954.",
      "Consult a tenant attorney before signing if the landlord won't budge on red-flag terms.",
    ],
    verified_findings: applyRules(SAMPLE_DOCUMENT),
  };
}

export function buildParkingTicketDemoResult(): DemoExplainResult {
  return {
    document_type: "Parking Ticket",
    jurisdiction: "California",
    risk_score: 5,
    summary:
      "This San Francisco parking citation carries a $98 fine with escalating penalties if unpaid. The contest window is short and in-person only, and paying the ticket waives your right to challenge it.",
    key_terms: [
      {
        term: "Delinquency fee",
        explanation:
          "An extra $65 charge added if payment is not received within 21 days of the citation.",
      },
      {
        term: "Contest deadline",
        explanation:
          "You must appear in person within 15 calendar days to dispute the ticket — online contest is not allowed.",
      },
    ],
    deadlines: [
      {
        date_or_timeframe: "21 days from citation",
        what_happens:
          "Fine must be paid or a $65 delinquency fee is added; further penalties apply after 45 days.",
      },
      {
        date_or_timeframe: "15 calendar days from citation",
        what_happens:
          "Last day to contest in person at the Parking Violations Bureau.",
      },
    ],
    red_flags: [
      {
        clause: "Paying waives hearing rights",
        why: "Payment is treated as an admission of guilt and ends your ability to contest the citation.",
        source_quote:
          "By paying this citation, you waive all rights to a hearing and admit guilt.",
        verified: false,
      },
      {
        clause: "In-person contest only",
        why: "No online dispute option may make it harder to challenge the ticket on time.",
        source_quote:
          "you must appear in person at Parking Violations Bureau within 15 calendar days",
        verified: false,
      },
    ],
    next_steps: [
      "Verify the citation details (date, zone, and vehicle) against your records.",
      "Decide whether to pay or contest before the 15-day contest window closes.",
      "If contesting, gather photos or receipts and appear in person by the deadline.",
      "Consult a local traffic/parking attorney if penalties escalate or the vehicle is booted.",
    ],
    verified_findings: applyRules(PARKING_TICKET_DOCUMENT),
  };
}

export function buildGymContractDemoResult(): DemoExplainResult {
  return {
    document_type: "Gym Contract",
    jurisdiction: "California",
    risk_score: 6,
    summary:
      "This gym membership locks you into a 12-month term with auto-renewal, a $150 early cancellation fee, mandatory arbitration, and a broad liability waiver that may limit your remedies if you're injured.",
    key_terms: [
      {
        term: "Early termination fee",
        explanation:
          "A $150 penalty if you cancel before the end of a 12-month commitment period.",
      },
      {
        term: "Auto-renewal",
        explanation:
          "Membership renews for another full year unless you give 60 days' written notice before the renewal date.",
      },
    ],
    deadlines: [
      {
        date_or_timeframe: "60 days before renewal",
        what_happens:
          "Written cancellation notice must be delivered or the membership auto-renews for 12 more months.",
      },
    ],
    red_flags: [
      {
        clause: "Broad liability waiver",
        why: "You may be giving up the right to sue even if the club is negligent.",
        source_quote:
          "releases Club from any liability, including Club's own negligence, to the fullest extent permitted by law",
        verified: false,
      },
      {
        clause: "Mandatory arbitration",
        why: "Disputes go to binding arbitration in a forum chosen by the club, not a court.",
        source_quote:
          "all disputes shall be resolved by binding arbitration in a forum selected by Club",
        verified: false,
      },
      {
        clause: "Early termination fee",
        why: "Canceling mid-term triggers a $150 fee on top of remaining obligations.",
        source_quote:
          "Member will be charged a $150 early termination fee if cancellation occurs before the end of any commitment period",
        verified: false,
      },
    ],
    next_steps: [
      "Ask for the auto-renewal and cancellation policy in writing before signing.",
      "Negotiate a shorter initial term or a lower early-termination fee if possible.",
      "Review whether the liability waiver and arbitration clause are enforceable in California.",
      "Consult a consumer attorney if you're unsure about the commitment length or fees.",
    ],
    verified_findings: applyRules(GYM_CONTRACT_DOCUMENT),
  };
}
