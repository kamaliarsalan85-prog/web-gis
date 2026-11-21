// Rich realistic GIS datasets for parcels, mahalles (districts), and mabar (streets)
export const initialParcels = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'p-101',
      properties: {
        id: '101',
        parcel_code: 'PC-2024-001',
        land_use: 'Residential',
        area_sqm: 450,
        floors: 4,
        value_usd: 650000,
        owner: 'Tech Capital Ltd',
        zone: 'Zone 1-North',
        status: 'Constructed'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [51.3880, 35.6910],
            [51.3910, 35.6910],
            [51.3910, 35.6895],
            [51.3880, 35.6895],
            [51.3880, 35.6910]
          ]
        ]
      }
    },
    {
      type: 'Feature',
      id: 'p-102',
      properties: {
        id: '102',
        parcel_code: 'PC-2024-002',
        land_use: 'Commercial',
        area_sqm: 620,
        floors: 6,
        value_usd: 1200000,
        owner: 'Grand Plaza Holdings',
        zone: 'Zone 1-Central',
        status: 'Active Commercial'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [51.3915, 35.6910],
            [51.3950, 35.6910],
            [51.3950, 35.6895],
            [51.3915, 35.6895],
            [51.3915, 35.6910]
          ]
        ]
      }
    },
    {
      type: 'Feature',
      id: 'p-103',
      properties: {
        id: '103',
        parcel_code: 'PC-2024-003',
        land_use: 'Green Space',
        area_sqm: 1100,
        floors: 0,
        value_usd: 400000,
        owner: 'Municipal Parks Dept',
        zone: 'Zone 1-Park',
        status: 'Public Park'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [51.3880, 35.6890],
            [51.3910, 35.6890],
            [51.3910, 35.6870],
            [51.3880, 35.6870],
            [51.3880, 35.6890]
          ]
        ]
      }
    },
    {
      type: 'Feature',
      id: 'p-104',
      properties: {
        id: '104',
        parcel_code: 'PC-2024-004',
        land_use: 'Educational',
        area_sqm: 850,
        floors: 3,
        value_usd: 800000,
        owner: 'City Education Board',
        zone: 'Zone 2-East',
        status: 'Campus Active'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [51.3915, 35.6890],
            [51.3955, 35.6890],
            [51.3955, 35.6870],
            [51.3915, 35.6870],
            [51.3915, 35.6890]
          ]
        ]
      }
    },
    {
      type: 'Feature',
      id: 'p-105',
      properties: {
        id: '105',
        parcel_code: 'PC-2024-005',
        land_use: 'Residential',
        area_sqm: 520,
        floors: 5,
        value_usd: 750000,
        owner: 'Skyline Residences',
        zone: 'Zone 2-South',
        status: 'Under Construction'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [51.3880, 35.6865],
            [51.3930, 35.6865],
            [51.3930, 35.6845],
            [51.3880, 35.6845],
            [51.3880, 35.6865]
          ]
        ]
      }
    }
  ]
};

export const initialMahalles = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'm-1',
      properties: {
        id: '1',
        name: 'District 1 - Azadi North',
        population: 42500,
        density_sqkm: 6800,
        green_coverage_pct: 28,
        safety_index: 8.7,
        avg_household_income: 38000
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [51.3850, 35.6930],
            [51.3970, 35.6930],
            [51.3970, 35.6880],
            [51.3850, 35.6880],
            [51.3850, 35.6930]
          ]
        ]
      }
    },
    {
      type: 'Feature',
      id: 'm-2',
      properties: {
        id: '2',
        name: 'District 2 - Ferdowsi South',
        population: 36200,
        density_sqkm: 7400,
        green_coverage_pct: 19,
        safety_index: 8.2,
        avg_household_income: 44000
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [51.3850, 35.6880],
            [51.3970, 35.6880],
            [51.3970, 35.6830],
            [51.3850, 35.6830],
            [51.3850, 35.6880]
          ]
        ]
      }
    }
  ]
};

export const initialMabar = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 's-1',
      properties: {
        id: 's1',
        name: 'Grand Central Boulevard',
        type: 'Arterial Road',
        lanes: 6,
        speed_limit: 60,
        traffic_level: 'High',
        surface: 'Asphalt Grade A'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [51.3840, 35.6892],
          [51.3900, 35.6892],
          [51.3980, 35.6892]
        ]
      }
    },
    {
      type: 'Feature',
      id: 's-2',
      properties: {
        id: 's2',
        name: 'Valley Avenue',
        type: 'Collector Street',
        lanes: 4,
        speed_limit: 50,
        traffic_level: 'Moderate',
        surface: 'Asphalt'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [51.3912, 35.6940],
          [51.3912, 35.6892],
          [51.3912, 35.6820]
        ]
      }
    },
    {
      type: 'Feature',
      id: 's-3',
      properties: {
        id: 's3',
        name: 'Parkside Greenway',
        type: 'Local Street & Bike Lane',
        lanes: 2,
        speed_limit: 30,
        traffic_level: 'Low',
        surface: 'Permeable Pavement'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [51.3880, 35.6940],
          [51.3880, 35.6892],
          [51.3880, 35.6820]
        ]
      }
    }
  ]
};
