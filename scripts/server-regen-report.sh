#!/bin/bash
curl -s -X POST "http://localhost:3000/api/jobs/run" -H "Content-Type: application/json" -d '{"job":"generateWeeklyAIReport","brand":"NOBL"}'
