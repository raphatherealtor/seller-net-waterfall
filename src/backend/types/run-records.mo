import Common "../types/common";

module {
  public type RunId = Common.RunId;
  public type UserId = Common.UserId;
  public type Timestamp = Common.Timestamp;

  /// A persisted, immutable snapshot of one calculator run.
  ///
  /// The backend stores the snapshot verbatim and never recomputes or alters
  /// financial values. The calculator lives in the frontend as a pure module;
  /// the JSON payloads below are opaque to the backend and are returned exactly
  /// as they were submitted.
  public type RunRecord = {
    /// Client-generated identifier, unique per owner.
    runId : RunId;
    /// Version of the canonical calculator that produced this snapshot.
    calculatorVersion : Text;
    /// Property / case identifier supplied by the user.
    propertyId : Text;
    /// Effective inputs the calculator actually used, serialized as JSON.
    effectiveInputsJson : Text;
    /// Provenance state per input field, serialized as JSON.
    inputProvenanceJson : Text;
    /// Deterministic hash of the effective inputs.
    inputHash : Text;
    /// Calculator outputs, serialized as JSON.
    outputsJson : Text;
    /// Creation time in nanoseconds since the Unix epoch.
    createdAt : Timestamp;
  };

  /// A run record together with its owner, as stored internally.
  public type StoredRunRecord = {
    owner : UserId;
    record : RunRecord;
  };

  /// Caller-visible view of a run record. Identical to the stored snapshot;
  /// the owner is implied by the caller's identity.
  public type RunRecordView = RunRecord;

  /// Input accepted when saving a new run record.
  public type SaveRunRecordInput = {
    runId : RunId;
    calculatorVersion : Text;
    propertyId : Text;
    effectiveInputsJson : Text;
    inputProvenanceJson : Text;
    inputHash : Text;
    outputsJson : Text;
  };

  /// Failure modes for run record operations.
  public type RunRecordError = {
    /// No run record with this id exists for the caller.
    #notFound : RunId;
    /// A run record with this id already exists for the caller.
    #alreadyExists : RunId;
    /// The caller is not signed in.
    #notAuthenticated;
    /// The submitted snapshot failed a structural check.
    #invalidInput : Text;
  };
};
