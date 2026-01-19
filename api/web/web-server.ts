#!/usr/bin/env node

import { startWebServer } from './web.js';
import { logger } from '../../core/logger.js';

logger.info('Starting web UI server...');
startWebServer();