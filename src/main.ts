// SPDX-License-Identifier: AGPL-3.0-or-later
import { mount } from 'svelte';
import { iniciarTema } from '@ipn/comun/js/tema.js';
import '@ipn/comun/dist/fuentes.css';
import '@ipn/comun/dist/tokens.css';
import './estilos/base.css';
import App from './App.svelte';

iniciarTema();

const raiz = document.getElementById('app');
if (!raiz) throw new Error('main.ts: falta el elemento #app en index.html');
mount(App, { target: raiz });
