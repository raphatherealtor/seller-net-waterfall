import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// Generated components expose `data-ocid` markers; make them queryable by test
// id without misreading a missing semantic selector as a timing failure.
configure({ testIdAttribute: "data-ocid" });
