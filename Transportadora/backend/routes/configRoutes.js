const express = require('express');
const router = express.Router();
const ciudades = [
    "ASUNCION", "CIUDAD DEL ESTE", "ENCARNACION", "CORONEL OVIEDO",
    "CONCEPCION", "SAN LORENZO", "LUQUE", "CAPIATA", "LAMBARE",
    "FERNANDO DE LA MORA", "LIMPIO", "NEMBY", "MARIANO ROQUE ALONSO",
    "VILLA ELISA", "SAN ANTONIO", "HERNANDARIAS", "PRESIDENTE FRANCO",
    "PEDRO JUAN CABALLERO", "VILLARRICA", "CAACUPE", "PARAGUARI",
    "CAAZAPA", "SAN JUAN BAUTISTA", "SANTA ROSA", "AYOLAS"
];

const tiposCarga = ["NORMAL", "FRAGIL", "PESADO", "REFRIGERADA"];

router.get('/ciudades', (req, res) => {
    res.json(ciudades);
});

router.get('/tipos-carga', (req, res) => {
    res.json(tiposCarga);
});

module.exports = router;