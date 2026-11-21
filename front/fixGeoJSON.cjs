const fs = require('fs').promises;
const path = require('path');
const kinks = require('@turf/kinks').default;
const unkinkPolygon = require('@turf/unkink-polygon').default;
const cleanCoords = require('@turf/clean-coords').default;

async function fixGeoJSONFiles() {
  try {
    const files = await fs.readdir('data');
    for (const file of files.filter(f => f.endsWith('.geojson'))) {
      const filePath = path.join('data', file);
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      data.features = data.features.map((feature, index) => {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          const invalid = kinks(feature);
          if (invalid.features.length > 0) {
            console.log(`Fixing invalid geometry in ${file}, feature ${index}, mahalle_ID: ${feature.properties.mahalle_ID}`);
            let fixed = cleanCoords(feature);
            fixed = unkinkPolygon(fixed);
            if (fixed.features.length > 1) {
              console.warn(`Feature split into ${fixed.features.length} polygons. Using first polygon.`);
              return fixed.features[0];
            }
            return fixed;
          }
          return feature;
        }
        return feature;
      });

      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`Fixed GeoJSON file: ${file}`);
    }
  } catch (error) {
    console.error('Error fixing GeoJSON files:', error.message);
  }
}

fixGeoJSONFiles();
