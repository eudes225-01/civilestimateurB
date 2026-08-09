// src/server.js
// Point d'entrée : démarre le serveur HTTP.
//   npm install && npm start
// Variables d'environnement : voir .env.example
import { createApp } from './app.js'
import { env, warnMissingConfig } from './config/env.js'

warnMissingConfig()
const app = createApp()
app.listen(env.PORT, () => console.log(`CivilEstimator API → http://localhost:${env.PORT}`))
