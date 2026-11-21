import React from 'react';
import FeatureFilter from './FeatureFilter'; // وارد کردن FeatureFilter
import { useMap } from 'react-leaflet';

const FeatureFilterWrapper = ({ layers, onFilter }) => {
  const map = useMap();
  return <FeatureFilter map={map} layers={layers} onFilter={onFilter} />;
};

export default FeatureFilterWrapper;