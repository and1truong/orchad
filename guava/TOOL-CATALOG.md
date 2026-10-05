# Domain tool catalog

These seven tools are returned by describe. Input schemas below are generated from the same registry used for backend validation. All calls use the Agent App Bridge 0.1 envelope. Maximum request body: 256 KiB.

## canvas_get_graph

Effect: read. Read a stable graph page. Node and edge offsets are independent; revision is the snapshot revision. Reset pagination if revision changes. Maximum 100 nodes and 200 edges per page.

Input schema:

{
  "type": "object",
  "properties": {
    "nodeOffset": {
      "type": "integer",
      "minimum": 0,
      "maximum": 500
    },
    "edgeOffset": {
      "type": "integer",
      "minimum": 0,
      "maximum": 1000
    },
    "nodeLimit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "edgeLimit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [],
  "additionalProperties": false
}

## canvas_get_neighbors

Effect: read. Read bounded undirected neighbors of explicit node IDs, depth 0–2, at most 100 nodes. Does not reinterpret current selection. Reports truncation.

Input schema:

{
  "type": "object",
  "properties": {
    "nodeIds": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "pattern": "^[a-zA-Z0-9_-]+$"
      },
      "maxItems": 20,
      "uniqueItems": true,
      "minItems": 1
    },
    "depth": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2
    }
  },
  "required": [
    "nodeIds",
    "depth"
  ],
  "additionalProperties": false
}

## evidence_search

Effect: read. Deterministic substring search over synthetic records in this document. Optional source kind and tag filters, at most 40 results; never queries production systems.

Input schema:

{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "maxLength": 200
    },
    "sourceKind": {
      "type": "string",
      "maxLength": 80
    },
    "tag": {
      "type": "string",
      "maxLength": 80
    },
    "offset": {
      "type": "integer",
      "minimum": 0,
      "maximum": 1000
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 40
    }
  },
  "required": [],
  "additionalProperties": false
}

## evidence_get

Effect: read. Read synthetic evidence records by explicit stable IDs, including timestamp and source metadata. All IDs must belong to the current authorized document.

Input schema:

{
  "type": "object",
  "properties": {
    "evidenceIds": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "pattern": "^[a-zA-Z0-9_-]+$"
      },
      "maxItems": 20,
      "uniqueItems": true,
      "minItems": 1
    }
  },
  "required": [
    "evidenceIds"
  ],
  "additionalProperties": false
}

## canvas_apply_patch

Effect: write. Atomically apply up to 100 domain operations at expectedRevision: add/update/delete nodes, add/update/delete edges, or deterministic auto_layout. Node deletion requires incident edges deleted in the same batch. Hypotheses remain hypotheses; conclusions must use investigation_propose_conclusion. Accepted conclusions cannot be deleted. Maximum graph 500 nodes / 1000 edges.

Input schema:

{
  "type": "object",
  "properties": {
    "operations": {
      "type": "array",
      "minItems": 1,
      "maxItems": 100,
      "items": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "op": {
                "const": "add_node"
              },
              "node": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 80,
                    "pattern": "^[a-zA-Z0-9_-]+$"
                  },
                  "type": {
                    "enum": [
                      "incident",
                      "observation",
                      "hypothesis",
                      "evidence",
                      "note"
                    ]
                  },
                  "label": {
                    "type": "string",
                    "maxLength": 160,
                    "minLength": 1
                  },
                  "body": {
                    "type": "string",
                    "maxLength": 4000
                  },
                  "position": {
                    "type": "object",
                    "properties": {
                      "x": {
                        "type": "number",
                        "minimum": -100000,
                        "maximum": 100000
                      },
                      "y": {
                        "type": "number",
                        "minimum": -100000,
                        "maximum": 100000
                      }
                    },
                    "required": [
                      "x",
                      "y"
                    ],
                    "additionalProperties": false
                  },
                  "evidenceIds": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 80,
                      "pattern": "^[a-zA-Z0-9_-]+$"
                    },
                    "maxItems": 40,
                    "uniqueItems": true
                  }
                },
                "required": [
                  "id",
                  "type",
                  "label",
                  "body",
                  "position",
                  "evidenceIds"
                ],
                "additionalProperties": false
              }
            },
            "required": [
              "op",
              "node"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "op": {
                "const": "update_node"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 80,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "changes": {
                "type": "object",
                "properties": {
                  "label": {
                    "type": "string",
                    "maxLength": 160,
                    "minLength": 1
                  },
                  "body": {
                    "type": "string",
                    "maxLength": 4000
                  },
                  "position": {
                    "type": "object",
                    "properties": {
                      "x": {
                        "type": "number",
                        "minimum": -100000,
                        "maximum": 100000
                      },
                      "y": {
                        "type": "number",
                        "minimum": -100000,
                        "maximum": 100000
                      }
                    },
                    "required": [
                      "x",
                      "y"
                    ],
                    "additionalProperties": false
                  },
                  "evidenceIds": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 80,
                      "pattern": "^[a-zA-Z0-9_-]+$"
                    },
                    "maxItems": 40,
                    "uniqueItems": true
                  }
                },
                "required": [],
                "additionalProperties": false,
                "minProperties": 1
              }
            },
            "required": [
              "op",
              "id",
              "changes"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "op": {
                "const": "delete_node"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 80,
                "pattern": "^[a-zA-Z0-9_-]+$"
              }
            },
            "required": [
              "op",
              "id"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "op": {
                "const": "add_edge"
              },
              "edge": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 80,
                    "pattern": "^[a-zA-Z0-9_-]+$"
                  },
                  "source": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 80,
                    "pattern": "^[a-zA-Z0-9_-]+$"
                  },
                  "target": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 80,
                    "pattern": "^[a-zA-Z0-9_-]+$"
                  },
                  "type": {
                    "enum": [
                      "relates",
                      "supports",
                      "contradicts"
                    ]
                  },
                  "label": {
                    "type": "string",
                    "maxLength": 160
                  }
                },
                "required": [
                  "id",
                  "source",
                  "target",
                  "type",
                  "label"
                ],
                "additionalProperties": false
              }
            },
            "required": [
              "op",
              "edge"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "op": {
                "const": "update_edge"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 80,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "changes": {
                "type": "object",
                "properties": {
                  "label": {
                    "type": "string",
                    "maxLength": 160
                  },
                  "type": {
                    "enum": [
                      "relates",
                      "supports",
                      "contradicts"
                    ]
                  }
                },
                "required": [],
                "additionalProperties": false,
                "minProperties": 1
              }
            },
            "required": [
              "op",
              "id",
              "changes"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "op": {
                "const": "delete_edge"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 80,
                "pattern": "^[a-zA-Z0-9_-]+$"
              }
            },
            "required": [
              "op",
              "id"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "op": {
                "const": "auto_layout"
              }
            },
            "required": [
              "op"
            ],
            "additionalProperties": false
          }
        ]
      }
    }
  },
  "required": [
    "operations"
  ],
  "additionalProperties": false
}

## canvas_undo

Effect: write. Undo an explicitly identified latest document mutation only if no intervening mutation occurred. Cannot revert an accepted conclusion. Produces a new revision; SQLite document changes only. Read mutationId from the original result.

Input schema:

{
  "type": "object",
  "properties": {
    "mutationId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80,
      "pattern": "^[a-zA-Z0-9_-]+$"
    }
  },
  "required": [
    "mutationId"
  ],
  "additionalProperties": false
}

## investigation_propose_conclusion

Effect: write. Create a PROPOSED conclusion, not a verified fact. Explicitly cite supporting and contradictory evidence records. Only a separate human action can accept a conclusion.

Input schema:

{
  "type": "object",
  "properties": {
    "summary": {
      "type": "string",
      "maxLength": 4000,
      "minLength": 1
    },
    "supportingEvidenceIds": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "pattern": "^[a-zA-Z0-9_-]+$"
      },
      "maxItems": 40,
      "uniqueItems": true,
      "minItems": 1
    },
    "contradictoryEvidenceIds": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "pattern": "^[a-zA-Z0-9_-]+$"
      },
      "maxItems": 40,
      "uniqueItems": true
    }
  },
  "required": [
    "summary",
    "supportingEvidenceIds",
    "contradictoryEvidenceIds"
  ],
  "additionalProperties": false
}

## Operations and conclusion boundary

add_node requires id, type, label, body, position and evidenceIds; the schema excludes type conclusion — propose one instead. update_node allows label/body/position/evidenceIds; conclusion content is immutable. delete_node must leave no dangling edges at the end of its batch, and cannot remove an accepted conclusion. add_edge requires id/source/target/type/label. update_edge edits label/type. delete_edge removes an explicit edge ID. auto_layout uses deterministic type columns and ID order. All operations commit together and increment revision once.

Use investigation_propose_conclusion for conclusions, with summary and both supportingEvidenceIds/contradictoryEvidenceIds arrays. At least one supporting record is required. Empty contradictions is allowed but shown honestly as none cited. All cited records are validated for document membership. Human acceptance is not exposed as a tool.

Success mutation data includes mutationId, with additional nodeId/status for a conclusion or undoneMutationId for undo. Read graph result includes independent nextNodeOffset/nextEdgeOffset and document revision; consumers must restart paging if revision changes.
