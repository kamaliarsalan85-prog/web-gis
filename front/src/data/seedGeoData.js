// Auto-generated initial GIS seed layers for static/offline database fallback
export const SEED_GEO_DATA = {
  "main-parcels": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "p-101",
        "properties": {
          "id": "101",
          "parcel_code": "PC-2024-001",
          "land_use": "Residential",
          "area_sqm": 450,
          "floors": 4,
          "value_usd": 650000,
          "owner": "Tech Capital Ltd",
          "zone": "Zone 1-North",
          "status": "Constructed"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                51.388,
                35.691
              ],
              [
                51.391,
                35.691
              ],
              [
                51.391,
                35.6895
              ],
              [
                51.388,
                35.6895
              ],
              [
                51.388,
                35.691
              ]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "p-102",
        "properties": {
          "id": "102",
          "parcel_code": "PC-2024-002",
          "land_use": "Commercial",
          "area_sqm": 620,
          "floors": 6,
          "value_usd": 1200000,
          "owner": "Grand Plaza Holdings",
          "zone": "Zone 1-Central",
          "status": "Active Commercial"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                51.3915,
                35.691
              ],
              [
                51.395,
                35.691
              ],
              [
                51.395,
                35.6895
              ],
              [
                51.3915,
                35.6895
              ],
              [
                51.3915,
                35.691
              ]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "p-103",
        "properties": {
          "id": "103",
          "parcel_code": "PC-2024-003",
          "land_use": "Green Space",
          "area_sqm": 1100,
          "floors": 0,
          "value_usd": 400000,
          "owner": "Municipal Parks Dept",
          "zone": "Zone 1-Park",
          "status": "Public Park"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                51.388,
                35.689
              ],
              [
                51.391,
                35.689
              ],
              [
                51.391,
                35.687
              ],
              [
                51.388,
                35.687
              ],
              [
                51.388,
                35.689
              ]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "p-104",
        "properties": {
          "id": "104",
          "parcel_code": "PC-2024-004",
          "land_use": "Educational",
          "area_sqm": 850,
          "floors": 3,
          "value_usd": 800000,
          "owner": "City Education Board",
          "zone": "Zone 2-East",
          "status": "Campus Active"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                51.3915,
                35.689
              ],
              [
                51.3955,
                35.689
              ],
              [
                51.3955,
                35.687
              ],
              [
                51.3915,
                35.687
              ],
              [
                51.3915,
                35.689
              ]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "p-105",
        "properties": {
          "id": "105",
          "parcel_code": "PC-2024-005",
          "land_use": "Residential",
          "area_sqm": 520,
          "floors": 5,
          "value_usd": 750000,
          "owner": "Skyline Residences",
          "zone": "Zone 2-South",
          "status": "Under Construction"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                51.388,
                35.6865
              ],
              [
                51.393,
                35.6865
              ],
              [
                51.393,
                35.6845
              ],
              [
                51.388,
                35.6845
              ],
              [
                51.388,
                35.6865
              ]
            ]
          ]
        }
      }
    ]
  },
  "main-mahalles": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "m-1",
        "properties": {
          "id": "1",
          "name": "District 1 - Azadi North",
          "population": 42500,
          "density_sqkm": 6800,
          "green_coverage_pct": 28,
          "safety_index": 8.7,
          "avg_household_income": 38000
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                51.385,
                35.693
              ],
              [
                51.397,
                35.693
              ],
              [
                51.397,
                35.688
              ],
              [
                51.385,
                35.688
              ],
              [
                51.385,
                35.693
              ]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "m-2",
        "properties": {
          "id": "2",
          "name": "District 2 - Ferdowsi South",
          "population": 36200,
          "density_sqkm": 7400,
          "green_coverage_pct": 19,
          "safety_index": 8.2,
          "avg_household_income": 44000
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                51.385,
                35.688
              ],
              [
                51.397,
                35.688
              ],
              [
                51.397,
                35.683
              ],
              [
                51.385,
                35.683
              ],
              [
                51.385,
                35.688
              ]
            ]
          ]
        }
      }
    ]
  },
  "main-mabar": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "s-1",
        "properties": {
          "id": "s1",
          "name": "Grand Central Boulevard",
          "type": "Arterial Road",
          "lanes": 6,
          "speed_limit": 60,
          "traffic_level": "High",
          "surface": "Asphalt Grade A"
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              51.384,
              35.6892
            ],
            [
              51.39,
              35.6892
            ],
            [
              51.398,
              35.6892
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "s-2",
        "properties": {
          "id": "s2",
          "name": "Valley Avenue",
          "type": "Collector Street",
          "lanes": 4,
          "speed_limit": 50,
          "traffic_level": "Moderate",
          "surface": "Asphalt"
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              51.3912,
              35.694
            ],
            [
              51.3912,
              35.6892
            ],
            [
              51.3912,
              35.682
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "s-3",
        "properties": {
          "id": "s3",
          "name": "Parkside Greenway",
          "type": "Local Street & Bike Lane",
          "lanes": 2,
          "speed_limit": 30,
          "traffic_level": "Low",
          "surface": "Permeable Pavement"
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              51.388,
              35.694
            ],
            [
              51.388,
              35.6892
            ],
            [
              51.388,
              35.682
            ]
          ]
        }
      }
    ]
  },
  "local-main-mabar": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "mahalle_ID": "new_1778603526378_brbkf9",
          "OBJECTID": "new_1778603526378_brbkf9",
          "Name": "پلی‌گان جدید new_1778603526378_brbkf9",
          "Shape_Area": 176382.5109936653
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                57.35041,
                37.476976
              ],
              [
                57.352555,
                37.474933
              ],
              [
                57.357531,
                37.477316
              ],
              [
                57.353756,
                37.480039
              ],
              [
                57.35041,
                37.476976
              ]
            ]
          ]
        },
        "id": "new_1778603526378_brbkf9"
      },
      {
        "type": "Feature",
        "properties": {
          "mahalle_ID": "new_1778603555786_pt61v0",
          "OBJECTID": "new_1778603555786_pt61v0",
          "Name": "پلی‌گان جدید new_1778603555786_pt61v0",
          "Shape_Area": 23189.967661874245
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                57.360933,
                37.482215
              ],
              [
                57.359732,
                37.479185
              ],
              [
                57.361319,
                37.479253
              ],
              [
                57.360933,
                37.482215
              ]
            ]
          ]
        },
        "id": "new_1778603555786_pt61v0"
      },
      {
        "type": "Feature",
        "id": "2000",
        "geometry": {
          "coordinates": [
            [
              57.33,
              37.47
            ],
            [
              57.34,
              37.48
            ]
          ],
          "type": "LineString"
        },
        "properties": {
          "street_name": "Validation Street",
          "OBJECTID": 2000
        }
      },
      {
        "type": "Feature",
        "properties": {
          "mahalle_ID": "new_1778609345484_1k2e72",
          "OBJECTID": "new_1778609345484_1k2e72",
          "Name": "پلی‌گان جدید new_1778609345484_1k2e72",
          "Shape_Area": 39942.547750462036
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                57.349425,
                37.481257
              ],
              [
                57.349403,
                37.479008
              ],
              [
                57.347151,
                37.479485
              ],
              [
                57.348417,
                37.48182
              ],
              [
                57.349425,
                37.481257
              ]
            ]
          ]
        },
        "id": "new_1778609345484_1k2e72"
      }
    ]
  }
};
