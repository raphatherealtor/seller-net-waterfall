import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "../types/run-records";

module {
  /// Flattened, queryable projection of a stored run record.
  ///
  /// The nested `Map<UserId, Map<RunId, RunRecord>>` store is reshaped into one
  /// row per record, promoting the owner principal and the run id out of the
  /// map keys into real columns so the data-intelligence layer can filter and
  /// join on them. The JSON payloads remain opaque text, stored verbatim.
  public type RunRecordRow = {
    owner : Principal;
    runId : Text;
    calculatorVersion : Text;
    propertyId : Text;
    effectiveInputsJson : Text;
    inputProvenanceJson : Text;
    inputHash : Text;
    outputsJson : Text;
    createdAt : Int;
  };

  /// Iterate every stored run record as a flat row.
  public func rows(
    store : Map.Map<Types.UserId, Map.Map<Types.RunId, Types.RunRecord>>
  ) : Iter.Iter<RunRecordRow> {
    store.entries().flatMap(
      func((owner, owned)) {
        owned.values().map(
          func(record) {
            {
              owner;
              runId = record.runId;
              calculatorVersion = record.calculatorVersion;
              propertyId = record.propertyId;
              effectiveInputsJson = record.effectiveInputsJson;
              inputProvenanceJson = record.inputProvenanceJson;
              inputHash = record.inputHash;
              outputsJson = record.outputsJson;
              createdAt = record.createdAt;
            };
          }
        );
      }
    );
  };
};
