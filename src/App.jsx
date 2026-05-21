import Home from './pages/Home/Home.jsx';
import './App.css';

/**
 * Root component.
 * Right now there is only one page (Home).
 * When you add more pages, install `react-router-dom`
 * and replace this with a <Routes> tree.
 */
export default function App() {
  return (
    <div className="app">
      <Home />
    </div>
  );
}
