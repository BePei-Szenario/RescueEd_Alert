type PlannedAttendance={helperId:string|null;redeemedAt:Date|string|null;startAt:Date|string};

// A completed attendance still counts as attended; do not check removedAt.
// A future service cannot yet be marked as missed.
export function dutyNotAttended(row:PlannedAttendance,generatedAt:Date){
 return row.helperId===null&&row.redeemedAt===null&&new Date(row.startAt).getTime()<=generatedAt.getTime();
}
