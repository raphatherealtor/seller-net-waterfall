import Map "mo:core/Map";
import Principal "mo:core/Principal";
import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import OQL "mo:caffeineai-oql";
import Expose "mo:caffeineai-oql/Expose";
import Entity "mo:caffeineai-oql/Entity";
import RecordValue "mo:caffeineai-oql/RecordValue";
import PrincipalValue "mo:caffeineai-oql/PrincipalValue";
import TextValue "mo:caffeineai-oql/TextValue";
import IntValue "mo:caffeineai-oql/IntValue";
import RunRecordsApi "mixins/run-records-api";
import ApiDocMixin "mixins/api-doc";
import RunRecordTypes "types/run-records";
import RunRecordsOql "lib/run-records-oql";

actor {
  let accessControlState : AccessControl.AccessControlState;

  /// Snapshot run records, scoped per owner: owner -> runId -> record.
  let runRecords : Map.Map<RunRecordTypes.UserId, Map.Map<RunRecordTypes.RunId, RunRecordTypes.RunRecord>>;

  include MixinAuthorization(accessControlState, null);
  include RunRecordsApi(runRecords);
  include ApiDocMixin();
  include Expose({
    entities = [
      OQL.Entity.manual<RunRecordsOql.RunRecordRow>(
        "runRecord",
        func () = RunRecordsOql.rows(runRecords),
        "RunRecord",
        "runId",
      )
        .sample({
          owner = Principal.fromText("aaaaa-aa");
          runId = "";
          calculatorVersion = "";
          propertyId = "";
          effectiveInputsJson = "";
          inputProvenanceJson = "";
          inputHash = "";
          outputsJson = "";
          createdAt = 0;
        })
        .controllerOnly()
        .build(),
    ];
  });
};
