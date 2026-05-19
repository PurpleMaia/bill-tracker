import { Bills, PendingProposals, SupervisorUsers, User, UserBills } from "@/db/types";
import { Selectable } from "kysely";

export interface PendingUser{
  id: Selectable<User>['id'];
  email: Selectable<User>['email'];
  username: Selectable<User>['username'];
  created_at: Selectable<User>['created_at'];
  requested_admin: Selectable<User>['requested_admin'];
  requested_supervisor: Selectable<User>['requested_supervisor'];
  account_status: Selectable<User>['account_status'];
  role?: Selectable<User>['role']; // Optional, used for displaying current role in all users view
}

export interface SupervisorRequest {
  id: string;
  email: string;
  username: string;
  created_at: Date | null;
}

export interface Proposer {
  username: string | null;
  email: string | null;
  role: string | null;  
}
export interface PendingProposal extends Selectable<PendingProposals> {
  bill_number: Selectable<Bills>['bill_number'] | null;
  bill_title: Selectable<Bills>['bill_title'] | null;
  proposer: Proposer;

}

export interface AdoptedBill {
  bill_id: Selectable<Bills>['id'];
  bill_number: Selectable<Bills>['bill_number'];
  bill_title: Selectable<Bills>['bill_title'];
  current_status: Selectable<Bills>['bill_status'];
  adopted_at: Selectable<UserBills>['adopted_at'];
}
export interface InternWithBills {
  id: Selectable<User>['id'];
  email: Selectable<User>['email'];
  username: Selectable<User>['username'];
  created_at: Selectable<User>['created_at'];
  account_status: Selectable<User>['account_status'];
  supervisor_id: Selectable<SupervisorUsers>['id'] | null;
  supervisor_email: Selectable<User>['email'] | null;
  supervisor_username: Selectable<User>['username'] | null;
  adopted_bills: AdoptedBill[];
}

export interface Intern {
  id: Selectable<User>['id'];
  email: Selectable<User>['email'];
  username: Selectable<User>['username'];
  adopted_at: Selectable<User>['created_at'];  
}
export interface SupervisorWithInterns {
  supervisor_id: Selectable<User>['id'];
  supervisor_email: Selectable<User>['email'];
  supervisor_username: Selectable<User>['username'];
  interns: Intern[];
}

export interface BillWithInterns {  
  bill_id: Selectable<Bills>['id'];
  bill_number: Selectable<Bills>['bill_number'];
  bill_title: Selectable<Bills>['bill_title'];
  current_status: Selectable<Bills>['bill_status'];
  tracked_by: Intern[];
}