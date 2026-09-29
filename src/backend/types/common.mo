module {
  /// Identity of an authenticated caller.
  public type UserId = Principal;

  /// Wall-clock timestamp in nanoseconds since the Unix epoch.
  public type Timestamp = Int;

  /// Client-generated identifier for a saved calculator run.
  public type RunId = Text;
};
