import { Scenario, TimelineState } from "@/app/types";
import { Timestamp } from "@/lib/storage/firestore";

// Type for Firestore timestamps that can be various forms
export type FirestoreTimestamp =
    Timestamp | Date | { seconds: number; nanoseconds: number };

export interface FirestoreUser {
    email: string;
    displayName: string;
    createdAt: FirestoreTimestamp;
    photoURL: string;
}

export interface FirestoreScenario extends Scenario {
    id: string;
    userId: string;
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
}

export interface FirestoreTimelineState extends TimelineState {
    userId: string;
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
}
