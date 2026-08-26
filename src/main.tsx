import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'site-info-banner';
import './i18n';
// Register LUREF before either lazy viewer creates an OpenLayers view.
import './lib/crs';
import './styles.css';
import RootApp from './RootApp';

createRoot(document.getElementById('root')!).render(<StrictMode><RootApp /></StrictMode>);
