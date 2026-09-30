import Map "mo:core/Map";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Types "../types/run-records";

module {
  public type RunRecord = Types.RunRecord;
  public type RunRecordView = Types.RunRecordView;
  public type SaveRunRecordInput = Types.SaveRunRecordInput;
  public type RunRecordError = Types.RunRecordError;
  public type UserId = Types.UserId;
  public type RunId = Types.RunId;

  let maxIdentifierChars : Nat = 256;
  let maxJsonChars : Nat = 1_000_000;

  /// Structural validation of a submitted snapshot. The backend never inspects
  /// or recomputes financial values; it only rejects snapshots that cannot be
  /// stored or replayed faithfully.
  func validate(input : SaveRunRecordInput) : ?Text {
    if (input.runId == "") {
      return ?"runId must not be empty";
    };
    if (input.calculatorVersion == "") {
      return ?"calculatorVersion must not be empty";
    };
    if (input.inputHash == "") {
      return ?"inputHash must not be empty";
    };
    if (input.effectiveInputsJson == "") {
      return ?"effectiveInputsJson must not be empty";
    };
    if (input.outputsJson == "") {
      return ?"outputsJson must not be empty";
    };
    if (Text.size(input.runId) > maxIdentifierChars) {
      return ?"runId is too long";
    };
    if (Text.size(input.propertyId) > maxIdentifierChars) {
      return ?"propertyId is too long";
    };
    if (Text.size(input.calculatorVersion) > maxIdentifierChars) {
      return ?"calculatorVersion is too long";
    };
    if (Text.size(input.inputHash) > maxIdentifierChars) {
      return ?"inputHash is too long";
    };
    if (Text.size(input.effectiveInputsJson) > maxJsonChars) {
      return ?"effectiveInputsJson is too large";
    };
    if (Text.size(input.inputProvenanceJson) > maxJsonChars) {
      return ?"inputProvenanceJson is too large";
    };
    if (Text.size(input.outputsJson) > maxJsonChars) {
      return ?"outputsJson is too large";
    };
    null;
  };

  /// Persist a new snapshot for the owner. Fails when the owner already has a
  /// record with the same runId.
  public func save(
    store : Map.Map<UserId, Map.Map<RunId, RunRecord>>,
    owner : UserId,
    input : SaveRunRecordInput,
    now : Types.Timestamp,
  ) : Result.Result<RunRecordView, RunRecordError> {
    switch (validate(input)) {
      case (?message) { return #err(#invalidInput(message)) };
      case null {};
    };

    let owned = switch (store.get(owner)) {
      case (?existing) { existing };
      case null {
        let fresh = Map.empty<RunId, RunRecord>();
        store.add(owner, fresh);
        fresh;
      };
    };

    if (owned.get(input.runId) != null) {
      return #err(#alreadyExists(input.runId));
    };

    let record : RunRecord = {
      runId = input.runId;
      calculatorVersion = input.calculatorVersion;
      propertyId = input.propertyId;
      effectiveInputsJson = input.effectiveInputsJson;
      inputProvenanceJson = input.inputProvenanceJson;
      inputHash = input.inputHash;
      outputsJson = input.outputsJson;
      createdAt = now;
    };
    owned.add(input.runId, record);
    #ok(record);
  };

  /// List the owner's run records, newest first.
  public func list(
    store : Map.Map<UserId, Map.Map<RunId, RunRecord>>,
    owner : UserId,
  ) : [RunRecordView] {
    switch (store.get(owner)) {
      case null { [] };
      case (?owned) {
        owned.values().toArray().sort(
          func(a, b) {
            if (a.createdAt > b.createdAt) { #less } else if (a.createdAt < b.createdAt) {
              #greater;
            } else {
              #equal;
            };
          }
        );
      };
    };
  };

  /// Fetch a single run record owned by the caller.
  public func get(
    store : Map.Map<UserId, Map.Map<RunId, RunRecord>>,
    owner : UserId,
    runId : RunId,
  ) : ?RunRecordView {
    switch (store.get(owner)) {
      case null { null };
      case (?owned) { owned.get(runId) };
    };
  };

  /// Delete a run record owned by the caller.
  public func remove(
    store : Map.Map<UserId, Map.Map<RunId, RunRecord>>,
    owner : UserId,
    runId : RunId,
  ) : Result.Result<(), RunRecordError> {
    switch (store.get(owner)) {
      case null { #err(#notFound(runId)) };
      case (?owned) {
        if (owned.get(runId) == null) {
          return #err(#notFound(runId));
        };
        owned.remove(runId);
        #ok(());
      };
    };
  };
};
