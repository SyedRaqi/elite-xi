
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/brand.css'

const root = document.getElementById('app')

if (!root) {
  throw new Error('The app root element (#app) was not found.')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
