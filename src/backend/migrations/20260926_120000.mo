import Map "mo:core/Map";
import Principal "mo:core/Principal";
import AccessControl "mo:caffeineai-authorization/access-control";

module {
  // The deployed baseline is an empty Version 1.0.0 actor with no stable
  // fields, so this single pending migration takes the canister from that
  // empty state directly to the full current state. Types are defined inline
  // (migrations must not import project modules).
  type UserRole = {
    #admin;
    #user;
    #guest;
  };

  type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  type RunRecord = {
    runId : Text;
    calculatorVersion : Text;
    propertyId : Text;
    effectiveInputsJson : Text;
    inputProvenanceJson : Text;
    inputHash : Text;
    outputsJson : Text;
    createdAt : Int;
  };

  type OldActor = {};

  type NewActor = {
    accessControlState : AccessControlState;
    runRecords : Map.Map<Principal, Map.Map<Text, RunRecord>>;
  };

  public func migration(_ : OldActor) : NewActor {
    {
      accessControlState = AccessControl.initState();
      runRecords = Map.empty();
    };
  };
};
