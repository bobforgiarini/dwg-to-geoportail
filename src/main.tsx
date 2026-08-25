import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'site-info-banner';
import './i18n';
import './styles.css';
import RootApp from './RootApp';

createRoot(document.getElementById('root')!).render(<StrictMode><RootApp /></StrictMode>);
