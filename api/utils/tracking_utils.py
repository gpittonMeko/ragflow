#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""
Utility functions for tracking user information from HTTP requests
"""
from flask import Request
import re


def get_client_ip(request: Request) -> str:
    """
    Extract client IP address from Flask request.
    Handles proxy headers (X-Forwarded-For, X-Real-IP)
    """
    # Check proxy headers first
    if request.headers.get('X-Forwarded-For'):
        # X-Forwarded-For can contain multiple IPs, get the first one
        ip = request.headers.get('X-Forwarded-For').split(',')[0].strip()
    elif request.headers.get('X-Real-IP'):
        ip = request.headers.get('X-Real-IP')
    else:
        ip = request.remote_addr
    
    return ip or 'Unknown'


def parse_user_agent(user_agent_string: str) -> dict:
    """
    Parse user agent string to extract browser, OS, and device type
    
    Returns:
        dict with keys: browser, os, device_type
    """
    if not user_agent_string:
        return {
            'browser': 'Unknown',
            'os': 'Unknown',
            'device_type': 'desktop'
        }
    
    ua = user_agent_string.lower()
    
    # Detect browser
    browser = 'Unknown'
    if 'edg' in ua or 'edge' in ua:
        browser = 'Edge'
    elif 'chrome' in ua and 'edg' not in ua:
        browser = 'Chrome'
    elif 'firefox' in ua:
        browser = 'Firefox'
    elif 'safari' in ua and 'chrome' not in ua:
        browser = 'Safari'
    elif 'opera' in ua or 'opr' in ua:
        browser = 'Opera'
    elif 'msie' in ua or 'trident' in ua:
        browser = 'IE'
    
    # Detect OS
    os = 'Unknown'
    if 'windows' in ua:
        if 'windows nt 10' in ua or 'windows nt 11' in ua:
            os = 'Windows 10/11'
        elif 'windows nt 6' in ua:
            os = 'Windows 7/8'
        else:
            os = 'Windows'
    elif 'mac os x' in ua or 'macos' in ua:
        os = 'macOS'
    elif 'linux' in ua and 'android' not in ua:
        os = 'Linux'
    elif 'android' in ua:
        os = 'Android'
    elif 'iphone' in ua or 'ipad' in ua:
        os = 'iOS'
    
    # Detect device type
    device_type = 'desktop'
    if 'mobile' in ua or 'android' in ua or 'iphone' in ua:
        device_type = 'mobile'
    elif 'ipad' in ua or 'tablet' in ua:
        device_type = 'tablet'
    
    return {
        'browser': browser,
        'os': os,
        'device_type': device_type
    }


def get_tracking_info(request: Request) -> dict:
    """
    Extract all tracking information from Flask request
    
    Returns:
        dict with: ip_address, user_agent, browser, os, device_type, referrer, language
    """
    user_agent = request.headers.get('User-Agent', '')
    parsed_ua = parse_user_agent(user_agent)
    
    return {
        'ip_address': get_client_ip(request),
        'user_agent': user_agent[:512] if user_agent else None,  # Limit length
        'browser': parsed_ua['browser'],
        'os': parsed_ua['os'],
        'device_type': parsed_ua['device_type'],
        'referrer': request.referrer[:512] if request.referrer else None,
        'language': request.headers.get('Accept-Language', '').split(',')[0][:16] if request.headers.get('Accept-Language') else None
    }

