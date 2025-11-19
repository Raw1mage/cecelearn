#!/usr/bin/env python3
"""
Test script for Local LLM API
"""
import requests
import json
import sys


def test_health():
    """Test health endpoint"""
    print("\n=== Testing Health Endpoint ===")
    try:
        response = requests.get("http://localhost:8000/health")
        data = response.json()
        print(f"Status: {response.status_code}")
        print(json.dumps(data, indent=2))
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_models():
    """Test models endpoint"""
    print("\n=== Testing Models Endpoint ===")
    try:
        response = requests.get("http://localhost:8000/v1/models")
        data = response.json()
        print(f"Status: {response.status_code}")
        print(json.dumps(data, indent=2))
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_chat_completion():
    """Test chat completion endpoint"""
    print("\n=== Testing Chat Completion ===")
    try:
        payload = {
            "messages": [
                {"role": "user", "content": "Say hello in Chinese and explain the greeting."}
            ],
            "temperature": 0.7,
            "max_tokens": 100
        }

        response = requests.post(
            "http://localhost:8000/v1/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        data = response.json()
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            print(f"Model: {data['model']}")
            print(f"Response: {data['choices'][0]['message']['content']}")
            print(f"Tokens: {data['usage']['total_tokens']}")
            return True
        else:
            print(json.dumps(data, indent=2))
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_gemini_endpoint():
    """Test Gemini-compatible endpoint"""
    print("\n=== Testing Gemini Endpoint ===")
    try:
        payload = {
            "contents": [
                {"parts": [{"text": "解釋成語「守株待兔」的意思"}]}
            ],
            "systemInstruction": {
                "parts": [{"text": "你是一位中文教師"}]
            },
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 200
            }
        }

        response = requests.post(
            "http://localhost:8000/v1beta/models/gemini:generateContent",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        data = response.json()
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            print(f"Response: {data['candidates'][0]['content']['parts'][0]['text']}")
            return True
        else:
            print(json.dumps(data, indent=2))
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    print("=" * 60)
    print("Local LLM API Test Suite")
    print("=" * 60)

    results = []

    # Run tests
    results.append(("Health Check", test_health()))
    results.append(("Models List", test_models()))
    results.append(("Chat Completion", test_chat_completion()))
    results.append(("Gemini Endpoint", test_gemini_endpoint()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")

    print(f"\nPassed: {passed}/{total}")

    if passed == total:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n⚠️  Some tests failed. Check the output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
