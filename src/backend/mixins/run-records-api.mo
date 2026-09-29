import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/run-records";
import RunRecordsLib "../lib/run-records";

mixin (
  store : Map.Map<Types.UserId, Map.Map<Types.RunId, Types.RunRecord>>,
) {
  /// Save a snapshot run record for the signed-in caller.
  public shared ({ caller }) func saveRunRecord(
    input : Types.SaveRunRecordInput
  ) : async Result.Result<Types.RunRecordView, Types.RunRecordError> {
    if (caller.isAnonymous()) {
      return #err(#notAuthenticated);
    };
    RunRecordsLib.save(store, caller, input, Time.now());
  };

  /// List the caller's saved run records, newest first.
  public query ({ caller }) func listRunRecords() : async [Types.RunRecordView] {
    if (caller.isAnonymous()) {
      return [];
    };
    RunRecordsLib.list(store, caller);
  };

  /// Fetch one of the caller's run records by id.
  public query ({ caller }) func getRunRecord(
    runId : Types.RunId
  ) : async ?Types.RunRecordView {
    if (caller.isAnonymous()) {
      return null;
    };
    RunRecordsLib.get(store, caller, runId);
  };

  /// Delete one of the caller's run records by id.
  public shared ({ caller }) func deleteRunRecord(
    runId : Types.RunId
  ) : async Result.Result<(), Types.RunRecordError> {
    if (caller.isAnonymous()) {
      return #err(#notAuthenticated);
    };
    RunRecordsLib.remove(store, caller, runId);
  };
};
