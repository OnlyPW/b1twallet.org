import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Home from './pages/Home';
import CreateWallet from './pages/CreateWallet';
import ImportWallet from './pages/ImportWallet';
import Dashboard from './pages/Dashboard';
import Send from './pages/Send';
import Receive from './pages/Receive';
import Explorer from './pages/Explorer';
import Mempool from './pages/Mempool';
import Addresses from './pages/Addresses';
import Ordinals from './pages/Ordinals';
import CreateInscription from './pages/CreateInscription';
import B1T20Mint from './pages/B1T20Mint';
import './App.css';

function App() {
  return (
    <Router>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1A1A1A',
            color: '#fff',
            border: '1px solid #FF6B00',
          },
          success: {
            iconTheme: {
              primary: '#FF6B00',
              secondary: '#fff',
            },
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="create" element={<CreateWallet />} />
          <Route path="import" element={<ImportWallet />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="send" element={<Send />} />
          <Route path="receive" element={<Receive />} />
          <Route path="addresses" element={<Addresses />} />
          <Route path="explorer" element={<Explorer />} />
          <Route path="mempool" element={<Mempool />} />
          <Route path="ordinals" element={<Ordinals />} />
          <Route path="create-inscription" element={<CreateInscription />} />
          <Route path="b1t20-mint" element={<B1T20Mint />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;


