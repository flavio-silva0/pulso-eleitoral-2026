import {serveArchive} from '../lib/archive.mjs';
export default function handler(req,res){return serveArchive(req,res,'archive');}
