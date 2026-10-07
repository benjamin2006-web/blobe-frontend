import { useEffect, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

const MapViewport = ({ latitude, longitude }) => {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], 15);
  }, [map, latitude, longitude]);

  return null;
};

const LocationMap = ({ latitude, longitude, isOwnMessage }) => {
  const position = [latitude, longitude];
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  const mapView = (className, expandedMap = false) => (
    <MapContainer
      center={position}
      zoom={15}
      scrollWheelZoom
      className={className}
    >
      <TileLayer
        attribution='Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        maxZoom={19}
      />
      <MapViewport latitude={latitude} longitude={longitude} />
      <CircleMarker
        center={position}
        radius={expandedMap ? 11 : 9}
        pathOptions={{
          color: '#ffffff',
          weight: 3,
          fillColor: '#10b981',
          fillOpacity: 1,
        }}
      >
        <Popup>
          Shared location
          <br />
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </Popup>
      </CircleMarker>
    </MapContainer>
  );

  return (
    <div
      className={`w-[min(75vw,360px)] overflow-hidden rounded-2xl shadow-sm ${
        isOwnMessage ? 'bg-[#005c4b]' : 'bg-[#202c33]'
      }`}
    >
      <div className='flex items-center justify-between gap-3 px-3.5 py-2.5 text-white'>
        <div className='min-w-0'>
          <p className='text-sm font-semibold'>Shared location</p>
          <p className='mt-0.5 text-xs text-white/65'>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </p>
        </div>
        <button
          type='button'
          onClick={() => setExpanded(true)}
          aria-label='Expand map'
          title='Expand map'
          className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/75 transition hover:bg-white/10 hover:text-white'
        >
          <Maximize2 size={17} />
        </button>
      </div>
      {mapView('relative z-0 h-56 w-full')}
      {expanded &&
        createPortal(
          <div
            className='fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-0 backdrop-blur-sm sm:p-5 lg:p-10'
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setExpanded(false);
            }}
          >
            <section
              role='dialog'
              aria-modal='true'
              aria-label='Expanded shared location map'
              className='flex h-full w-full flex-col overflow-hidden bg-[#111b21] shadow-2xl sm:h-[92vh] sm:max-h-[1000px] sm:rounded-2xl'
            >
              <header className='flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 text-white sm:px-6'>
                <div>
                  <h2 className='text-base font-semibold'>Shared location</h2>
                  <p className='mt-0.5 text-xs text-white/65'>
                    {latitude.toFixed(6)}, {longitude.toFixed(6)}
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() => setExpanded(false)}
                  aria-label='Close expanded map'
                  title='Close map'
                  className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white'
                >
                  <X size={21} />
                </button>
              </header>
              <div className='min-h-0 flex-1'>
                {mapView('relative z-0 h-full w-full', true)}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default LocationMap;
